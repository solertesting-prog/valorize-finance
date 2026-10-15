import type { ChainNetwork } from '@prisma/client';
import { createHash } from 'crypto';
import { keccak256 } from './keccak';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest();

export const isEvm = (n: ChainNetwork) => n !== 'TRON';

export interface ParsedAddress {
  valid: boolean;
  /** Forma canónica para guardar y comparar: EVM en minúsculas, TRON en base58. */
  canonical: string;
  /** Forma para mostrar: EVM con checksum EIP-55. */
  display: string;
  /** Representación hex de 20 bytes (sin 0x), útil para llamadas a contratos. */
  hex20: string;
  error?: string;
}

/** Valida una dirección TRON: base58check, prefijo 0x41 y 25 bytes. */
function parseTron(address: string): ParsedAddress {
  const bad = (error: string): ParsedAddress => ({ valid: false, canonical: address, display: address, hex20: '', error });
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return bad('Una dirección TRON empieza por T y tiene 34 caracteres');
  const raw = base58Decode(address);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return bad('Dirección TRON no válida');
  const payload = raw.slice(0, 21);
  const check = sha256(sha256(payload)).subarray(0, 4);
  if (!Buffer.from(raw.slice(21)).equals(check)) return bad('La dirección TRON tiene un error (checksum incorrecto)');
  return { valid: true, canonical: address, display: address, hex20: Buffer.from(payload.slice(1)).toString('hex') };
}

/** EIP-55: si la dirección mezcla mayúsculas y minúsculas, el checksum debe cuadrar. */
export function toChecksumAddress(hex40: string): string {
  const lower = hex40.toLowerCase();
  const hash = keccak256(lower);
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

function parseEvm(address: string): ParsedAddress {
  const bad = (error: string): ParsedAddress => ({ valid: false, canonical: address, display: address, hex20: '', error });
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return bad('Una dirección de esta red empieza por 0x y tiene 42 caracteres');
  const body = address.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  const checksummed = toChecksumAddress(body);
  if (mixed && checksummed !== address) return bad('La dirección tiene un error (checksum incorrecto). Cópiala de nuevo.');
  if (/^0+$/.test(body)) return bad('Dirección no válida');
  return { valid: true, canonical: `0x${body.toLowerCase()}`, display: checksummed, hex20: body.toLowerCase() };
}

export function parseAddress(network: ChainNetwork, address: string): ParsedAddress {
  const a = address.trim();
  return network === 'TRON' ? parseTron(a) : parseEvm(a);
}

/** Codifica 20 bytes hex como dirección TRON base58 (para respuestas de TronGrid en hex). */
export function tronFromHex(hex: string): string {
  const h = hex.replace(/^0x/, '').replace(/^41/, '');
  const payload = Buffer.from(`41${h.padStart(40, '0')}`, 'hex');
  const check = sha256(sha256(payload)).subarray(0, 4);
  let n = BigInt(`0x${Buffer.concat([payload, check]).toString('hex')}`);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}
