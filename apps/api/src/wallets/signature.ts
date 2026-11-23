/**
 * Verificación de firmas de mensajes de wallets (prueba de propiedad), sin dependencias:
 *  - EVM (Ethereum, Polygon, BNB Chain): personal_sign / EIP-191, "\x19Ethereum Signed Message:\n<len><mensaje>"
 *  - TRON (TronLink signMessageV2 / TIP-191): "\x19TRON Signed Message:\n<len><mensaje>"
 * Se recupera la clave pública de la firma ECDSA secp256k1 (r, s, v) y se compara la dirección resultante.
 */
import { keccak256 } from './keccak';
import { toChecksumAddress, tronFromHex } from './address';

// Parámetros de la curva secp256k1
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G: Point = [
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
];

type Point = [bigint, bigint] | null;

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

function inv(a: bigint, m: bigint): bigint {
  let [lo, hi, x0, x1] = [mod(a, m), m, 1n, 0n];
  while (lo > 1n) {
    const q = hi / lo;
    [hi, lo] = [lo, hi - q * lo];
    [x1, x0] = [x0, x1 - q * x0];
  }
  return mod(x0, m);
}

function powMod(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

function add(p: Point, q: Point): Point {
  if (!p) return q;
  if (!q) return p;
  const [x1, y1] = p;
  const [x2, y2] = q;
  if (x1 === x2 && mod(y1 + y2, P) === 0n) return null;
  const l = x1 === x2 && y1 === y2 ? mod(3n * x1 * x1 * inv(2n * y1, P), P) : mod((y2 - y1) * inv(x2 - x1, P), P);
  const x3 = mod(l * l - x1 - x2, P);
  return [x3, mod(l * (x1 - x3) - y1, P)];
}

function mul(p: Point, k: bigint): Point {
  let r: Point = null;
  let a = p;
  k = mod(k, N);
  while (k > 0n) {
    if (k & 1n) r = add(r, a);
    a = add(a, a);
    k >>= 1n;
  }
  return r;
}

const hexToBytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const big = (b: Uint8Array) => BigInt(`0x${Buffer.from(b).toString('hex') || '0'}`);

/** Recupera la clave pública (sin comprimir, 64 bytes x||y en hex) de una firma sobre un hash de 32 bytes. */
export function recoverPublicKey(hashHex: string, signatureHex: string): string | null {
  const sig = hexToBytes(signatureHex);
  if (sig.length !== 65) return null;
  const r = big(sig.subarray(0, 32));
  const s = big(sig.subarray(32, 64));
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v > 1 || r <= 0n || r >= N || s <= 0n || s >= N) return null;
  // Punto R a partir de r y la paridad de y
  const x = r;
  const alpha = mod(x * x * x + 7n, P);
  let y = powMod(alpha, (P + 1n) / 4n, P);
  if (mod(y * y, P) !== alpha) return null;
  if ((y & 1n) !== BigInt(v)) y = P - y;
  const R: Point = [x, y];
  const e = mod(big(hexToBytes(hashHex)), N);
  const rInv = inv(r, N);
  // Q = r⁻¹ · (s·R − e·G)
  const Q = mul(add(mul(R, s), mul(G, N - e)), rInv);
  if (!Q) return null;
  return Q[0].toString(16).padStart(64, '0') + Q[1].toString(16).padStart(64, '0');
}

/** Hash del mensaje como lo firman las wallets (EIP-191 en EVM, TIP-191 en TRON). */
export function messageHash(kind: 'evm' | 'tron', message: string): string {
  const body = Buffer.from(message, 'utf8');
  const prefix = kind === 'evm' ? '\x19Ethereum Signed Message:\n' : '\x19TRON Signed Message:\n';
  return keccak256(Uint8Array.from(Buffer.concat([Buffer.from(`${prefix}${body.length}`, 'utf8'), body])));
}

/** Dirección que corresponde a una clave pública (EVM con checksum EIP-55; TRON en base58). */
export function addressFromPublicKey(kind: 'evm' | 'tron', pubHex: string): string {
  const h = keccak256(hexToBytes(pubHex)).slice(-40);
  return kind === 'evm' ? toChecksumAddress(h) : tronFromHex(h);
}

/** Dirección que firmó el mensaje, o null si la firma no es válida. */
export function recoverSigner(kind: 'evm' | 'tron', message: string, signatureHex: string): string | null {
  if (!/^(0x)?[0-9a-fA-F]{130}$/.test(signatureHex.trim())) return null;
  const pub = recoverPublicKey(messageHash(kind, message), signatureHex.trim());
  return pub ? addressFromPublicKey(kind, pub) : null;
}
