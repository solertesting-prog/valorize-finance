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

function run(name, cmd, args, env = {}) {
  const logFile = createWriteStream(path.join(ROOT, `${name}.log`), { flags: 'a' });
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
  child.stdout.pipe(logFile);
  child.stderr.pipe(logFile);
  child.on('exit', (code) => {
    if (!shuttingDown) fail(`${name} se ha detenido (código ${code}). Revisa .local-services/${name}.log`);
  });
  children.push(child);
  return child;
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

  for (const [port, name] of [[5432, 'PostgreSQL'], [6379, 'Redis'], [9000, 'Almacenamiento S3'], [1025, 'Mailpit']]) {
    if (await portBusy(port)) throw new Error(`El puerto ${port} (${name}) ya está en uso. Cierra el programa que lo usa o una ejecución anterior de este script.`);
  }

  const [redis, mailpit, storage] = await Promise.all([
    ensureZipTool('redis', 'redis-server.exe', 'redis-windows/redis-windows', /Windows-x64-msys2\.zip$/),
    ensureZipTool('mailpit', 'mailpit.exe', 'axllent/mailpit', /windows-amd64\.zip$/),
    ensureStorage(),
  ]);

  log('Arrancando PostgreSQL...');
  await startPostgres();

  log('Arrancando Redis, almacenamiento y Mailpit...');
  mkdirSync(path.join(DATA, 'redis'), { recursive: true });
  run('redis', redis, ['--port', '6379', '--bind', '127.0.0.1', '--dir', path.join(DATA, 'redis'), '--appendonly', 'yes']);
  if (storage) {
    const dir = path.join(DATA, 's3');
    mkdirSync(dir, { recursive: true });
    run('almacenamiento', storage, [
      'server', `-dir=${dir}`, '-ip=127.0.0.1', '-ip.bind=127.0.0.1',
      '-master.port=19333', '-volume.port=18080', '-filer.port=18888', '-master.volumeSizeLimitMB=1024',
      '-s3', '-s3.port=9000',
    ]);
  }
  run('mailpit', mailpit, ['--smtp', '127.0.0.1:1025', '--listen', '127.0.0.1:8025']);

  await Promise.all([waitPort(6379, 'Redis'), waitPort(1025, 'Mailpit'), storage ? waitPort(9000, 'Almacenamiento S3', 90) : null]);
  writeFileSync(READY, new Date().toISOString());

  console.log('\n  Servicios listos:');
  console.log('    PostgreSQL  localhost:5432  (valorize / valorize, base de datos "valorize")');
  console.log('    Redis       localhost:6379');
  console.log(`    S3          ${storage ? 'localhost:9000' : 'no disponible (subida de documentos desactivada)'}`);
  console.log('    Correo      http://localhost:8025');
  console.log('\n  Deja esta ventana abierta. Ctrl+C para pararlo todo.\n');
}

main().catch((e) => fail(e.message ?? String(e)));
