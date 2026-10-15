import type { ChainNetwork, CryptoAsset } from '@prisma/client';

/**
 * Contratos oficiales de USDT y USDC por red.
 * `blacklist` indica la función de lista negra del emisor, si el contrato la tiene:
 *   - Tether:  isBlackListed(address)  → 0xe47d6060
 *   - Circle:  isBlacklisted(address)  → 0xfe575a87
 * Los tokens "Binance-Peg" de BNB Chain no exponen lista negra on-chain.
 */
export interface TokenContract {
  address: string; // EVM 0x… o TRON base58
  decimals: number;
  blacklist: { selector: string; fn: string } | null;
}

const TETHER_BL = { selector: 'e47d6060', fn: 'isBlackListed' };
const CIRCLE_BL = { selector: 'fe575a87', fn: 'isBlacklisted' };

export const TOKENS: Record<ChainNetwork, Partial<Record<CryptoAsset, TokenContract>>> = {
  TRON: {
    USDT: { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, blacklist: TETHER_BL },
    USDC: { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6, blacklist: CIRCLE_BL },
  },
  ETHEREUM: {
    USDT: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6, blacklist: TETHER_BL },
    USDC: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, blacklist: CIRCLE_BL },
  },
  POLYGON: {
    USDT: { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6, blacklist: null },
    USDC: { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6, blacklist: CIRCLE_BL },
  },
  BSC: {
    USDT: { address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, blacklist: null },
    USDC: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, blacklist: null },
  },
};

/** Chain IDs para la API multicadena de Etherscan v2. */
export const EVM_CHAIN_ID: Record<Exclude<ChainNetwork, 'TRON'>, number> = { ETHEREUM: 1, POLYGON: 137, BSC: 56 };

export const DEFAULT_RPC: Record<Exclude<ChainNetwork, 'TRON'>, string> = {
  ETHEREUM: 'https://ethereum-rpc.publicnode.com',
  POLYGON: 'https://polygon-bor-rpc.publicnode.com',
  BSC: 'https://bsc-rpc.publicnode.com',
};

export const DEFAULT_TRONGRID = 'https://api.trongrid.io';

/** Formatea un entero de unidades mínimas a decimal legible. */
export function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6);
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}
