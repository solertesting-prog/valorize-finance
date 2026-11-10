#!/usr/bin/env node
/**
 * Servicios de desarrollo SIN Docker (pensado para Windows sin WSL).
 *
 *   node infra/local-services.mjs
 *
 * Descarga la primera vez, en .local-services/ (ignorado por git):
 *   - PostgreSQL embebido (paquete npm "embedded-postgres")  → localhost:5432  (valorize/valorize)
 *   - Redis para Windows (redis-windows/redis-windows)        → localhost:6379
 *   - SeaweedFS (almacenamiento S3 compatible)                → localhost:9000
 *   - Mailpit (bandeja de correo de pruebas)                  → SMTP :1025, web http://localhost:8025
 *
 * Mantén esta ventana abierta mientras desarrollas. Ctrl+C para pararlo todo.
 * En macOS/Linux usa infra/docker-compose.dev.yml.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.local-services');
const BIN = path.join(ROOT, 'bin');
const DATA = path.join(ROOT, 'data');
const READY = path.join(ROOT, 'ready');
const isWin = process.platform === 'win32';
const children = [];
let pg = null;

const LOG = path.join(ROOT, 'servicios.log');
const record = (m) => {
  try {
    mkdirSync(ROOT, { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
  } catch {
    /* noop */
  }
};
const log = (m) => (console.log(`[servicios] ${m}`), record(m));
const fail = (m) => {
  console.error(`\n[servicios] ERROR: ${m}\n`);
  record(`ERROR: ${m}`);
  void shutdown(1);
};

function portBusy(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });
}

async function download(url, dest) {
  log(`Descargando ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'valorize-dev' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function latestAsset(repo, pattern) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'valorize-dev', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} consultando ${repo}`);
  const rel = await res.json();
  const asset = rel.assets.find((a) => pattern.test(a.name));
  if (!asset) throw new Error(`No hay un binario para Windows en ${repo} ${rel.tag_name}`);
  return asset.browser_download_url;
}

function extract(zip, dir) {
  mkdirSync(dir, { recursive: true });
  // tar (bsdtar) viene con Windows 10/11 y descomprime .zip
  const r = spawnSync('tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`No se pudo descomprimir ${zip}`);
  rmSync(zip, { force: true });
}

function findFile(dir, name) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      const f = findFile(p, name);
      if (f) return f;
    } else if (e.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

async function ensureZipTool(name, exe, repo, pattern) {
  const dir = path.join(BIN, name);
  let file = existsSync(dir) ? findFile(dir, exe) : null;
  if (file) return file;
  const zip = path.join(BIN, `${name}.zip`);
  await download(await latestAsset(repo, pattern), zip);
  extract(zip, dir);
  file = findFile(dir, exe);
  if (!file) throw new Error(`No se encontró ${exe} tras descomprimir ${name}`);
  return file;
}

async function ensureStorage() {
  // MinIO ya no publica binarios para Windows; SeaweedFS ofrece una API S3 compatible.
  try {
    return await ensureZipTool('seaweedfs', 'weed.exe', 'seaweedfs/seaweedfs', /^windows_amd64\.zip$/);
  } catch (e) {
    log(`AVISO: no se pudo preparar el almacenamiento S3 (${e.message}). Todo funciona salvo la subida de documentos KYC.`);
    return null;
  }
}

/**
 * Arranca un servicio en segundo plano. Los opcionales (correo, almacenamiento) no tumban el resto si fallan:
 * un "spawn UNKNOWN" en Windows suele ser el antivirus bloqueando el .exe.
 */
function run(name, cmd, args, { optional = false } = {}) {
  const logFile = createWriteStream(path.join(ROOT, `${name}.log`), { flags: 'a' });
  const child = spawn(cmd, args, { env: process.env, windowsHide: true });
  child.stdout?.pipe(logFile);
  child.stderr?.pipe(logFile);
  let failed = false;
  const onFail = (why) => {
    if (failed || shuttingDown) return;
    failed = true;
    if (optional) {
      log(`AVISO: ${name} no ha podido arrancar (${why}). El resto sigue funcionando.${name === 'mailpit' ? ' Los correos (y sus códigos) aparecerán en la ventana de la API.' : ''}`);
      if (/UNKNOWN|EPERM|EACCES/.test(why)) log(`  Si el antivirus lo ha bloqueado, permite ${cmd}`);
    } else {
      fail(`${name} no ha podido arrancar o se ha detenido (${why}). Revisa .local-services/${name}.log${/UNKNOWN|EPERM|EACCES/.test(why) ? `. Si el antivirus lo ha bloqueado, permite ${cmd}` : ''}`);
    }
  };
  child.on('error', (e) => onFail(e.code ?? e.message));
  child.on('exit', (code) => onFail(`código ${code}`));
  children.push(child);
  return { child, ok: () => !failed };
}

/**
 * Para los servicios que hayan quedado vivos de una ejecución anterior (por ejemplo, si se cerró la ventana con la X):
 * primero PostgreSQL de forma ordenada y después cualquier proceso lanzado desde .local-services.
 */
function stopLeftovers() {
  const pgDir = path.join(DATA, 'postgres');
  const nm = path.join(ROOT, 'node_modules');
  const pgCtl = existsSync(nm) ? findFile(nm, 'pg_ctl.exe') : null;
  if (pgCtl && existsSync(path.join(pgDir, 'postmaster.pid'))) {
    log('Parando un PostgreSQL que quedó abierto de una ejecución anterior...');
    spawnSync(pgCtl, ['stop', '-D', pgDir, '-m', 'fast', '-w', '-t', '20'], { stdio: 'ignore', windowsHide: true });
  }
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${ROOT.replace(/'/g, "''")}', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.Name }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  const killed = (r.stdout ?? '').split(/\r?\n/).filter(Boolean);
  if (killed.length) log(`Cerrados procesos de una ejecución anterior: ${[...new Set(killed)].join(', ')}`);
}

async function waitPort(port, name, secs = 60) {
  for (let i = 0; i < secs * 2; i++) {
    if (await portBusy(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} no responde en el puerto ${port}`);
}

async function startPostgres() {
  const pkgDir = path.join(ROOT, 'node_modules', 'embedded-postgres');
  if (!existsSync(pkgDir)) {
    log('Instalando PostgreSQL embebido (solo la primera vez)...');
    writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify({ name: 'valorize-local-services', private: true }));
    const npm = isWin ? 'npm.cmd' : 'npm';
    const r = spawnSync(npm, ['install', '--no-audit', '--no-fund', 'embedded-postgres'], { cwd: ROOT, stdio: 'inherit', shell: isWin });
    if (r.status !== 0) throw new Error('No se pudo instalar embedded-postgres');
  }
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const exp = typeof pkg.exports === 'string' ? pkg.exports : pkg.exports?.['.'];
  const entry = (typeof exp === 'string' ? exp : (exp?.import?.default ?? exp?.import ?? exp?.default)) ?? pkg.module ?? pkg.main ?? 'index.js';
  const mod = await import(pathToFileURL(path.join(pkgDir, entry)).href);
  const EmbeddedPostgres = mod.default ?? mod.EmbeddedPostgres;

  const databaseDir = path.join(DATA, 'postgres');
  pg = new EmbeddedPostgres({
    databaseDir,
    user: 'valorize',
    password: 'valorize',
    port: 5432,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error('[postgres]', e?.toString?.() ?? e),
  });
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    log('Creando base de datos local...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('valorize');
  } catch {
    /* ya existe */
  }
}

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  rmSync(READY, { force: true });
  log('Parando servicios...');
  for (const c of children) c.kill();
  if (pg) await pg.stop().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

async function main() {
  if (!isWin) {
    console.log('En macOS/Linux usa: docker compose -f infra/docker-compose.dev.yml up -d');
    process.exit(1);
  }
  mkdirSync(BIN, { recursive: true });
  mkdirSync(DATA, { recursive: true });
  rmSync(READY, { force: true });

  const ports = [[5432, 'PostgreSQL'], [6379, 'Redis'], [9000, 'Almacenamiento S3'], [1025, 'Mailpit']];
  const busy = async () => (await Promise.all(ports.map(async ([p, n]) => ((await portBusy(p)) ? [p, n] : null)))).filter(Boolean);
  if ((await busy()).length) {
    stopLeftovers();
    await new Promise((r) => setTimeout(r, 1500));
  }
  const still = await busy();
  if (still.length) {
    const [port, name] = still[0];
    throw new Error(
      `El puerto ${port} (${name}) lo está usando otro programa.` +
        (port === 5432 ? ' ¿Tienes PostgreSQL instalado en el PC? Para su servicio en services.msc o desinstálalo.' : ' Ciérralo y vuelve a ejecutar valorize-arrancar.bat.'),
    );
  }

  const [redis, mailpit, storage] = await Promise.all([
    ensureZipTool('redis', 'redis-server.exe', 'redis-windows/redis-windows', /Windows-x64-msys2\.zip$/),
    ensureZipTool('mailpit', 'mailpit.exe', 'axllent/mailpit', /windows-amd64\.zip$/).catch((e) => {
      log(`AVISO: no se pudo preparar Mailpit (${e.message}). Los correos aparecerán en la ventana de la API.`);
      return null;
    }),
    ensureStorage(),
  ]);

  log('Arrancando PostgreSQL...');
  await startPostgres();

  log('Arrancando Redis, almacenamiento y Mailpit...');
  mkdirSync(path.join(DATA, 'redis'), { recursive: true });
  run('redis', redis, ['--port', '6379', '--bind', '127.0.0.1', '--dir', path.join(DATA, 'redis'), '--appendonly', 'yes']);
  let s3 = null;
  if (storage) {
    const dir = path.join(DATA, 's3');
    mkdirSync(dir, { recursive: true });
    s3 = run('almacenamiento', storage, [
      'server', `-dir=${dir}`, '-ip=127.0.0.1', '-ip.bind=127.0.0.1',
      '-master.port=19333', '-volume.port=18080', '-filer.port=18888', '-master.volumeSizeLimitMB=1024',
      '-s3', '-s3.port=9000',
    ], { optional: true });
  }
  const mail = mailpit ? run('mailpit', mailpit, ['--smtp', '127.0.0.1:1025', '--listen', '127.0.0.1:8025'], { optional: true }) : null;

  // Redis es imprescindible; correo y almacenamiento, si fallan, solo avisan.
  const soft = (p) => p.then(() => true, () => false);
  const [, mailUp, s3Up] = await Promise.all([
    waitPort(6379, 'Redis'),
    mail ? soft(waitPort(1025, 'Mailpit', 30)) : false,
    s3 ? soft(waitPort(9000, 'Almacenamiento S3', 90)) : false,
  ]);
  writeFileSync(READY, new Date().toISOString());

  console.log('\n  Servicios listos:');
  console.log('    PostgreSQL  localhost:5432  (valorize / valorize, base de datos "valorize")');
  console.log('    Redis       localhost:6379');
  console.log(`    S3          ${s3Up ? 'localhost:9000' : 'no disponible (subida de documentos desactivada)'}`);
  console.log(`    Correo      ${mailUp ? 'http://localhost:8025' : 'no disponible: los correos y sus códigos salen en la ventana de la API'}`);
  console.log('\n  Deja esta ventana abierta. Ctrl+C para pararlo todo.\n');
}

main().catch((e) => fail(e.message ?? String(e)));
