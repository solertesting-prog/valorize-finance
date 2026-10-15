import { Inject, Injectable } from '@nestjs/common';
import type { ChainNetwork, CryptoAsset } from '@prisma/client';
import { ENV, Env } from '../config/env';
import { parseAddress, tronFromHex } from './address';
import { DEFAULT_RPC, DEFAULT_TRONGRID, EVM_CHAIN_ID, formatUnits, TOKENS } from './chains';

const TIMEOUT = 8000;

export interface OnchainSnapshot {
  /** Saldo del token consultado, en unidades legibles. */
  tokenBalance?: string;
  /** Saldo nativo (ETH/MATIC/BNB/TRX). */
  nativeBalance?: string;
  /** Nº de transacciones enviadas (EVM: nonce). */
  outgoingTxCount?: number;
  /** Fecha de la primera actividad conocida (ISO). */
  firstSeenAt?: string | null;
  /** La dirección es un contrato (EVM). */
  isContract?: boolean;
  /** La cuenta existe en la red (TRON: activada). */
  exists?: boolean;
}

/** Evento Transfer(address,address,uint256) de ERC-20 / TRC-20. */
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface TokenTransfer {
  /** Contrato del token: EVM 0x… en minúsculas, TRON base58. */
  token: string;
  from: string;
  to: string;
  raw: bigint;
}

export interface TxLookup {
  state: 'not_found' | 'pending' | 'failed' | 'success';
  blockNumber?: number;
  timestamp?: string;
  confirmations?: number;
  transfers: TokenTransfer[];
}

interface EvmLog {
  address: string;
  topics: string[];
  data: string;
}

/**
 * Lecturas on-chain sin custodiar fondos ni claves:
 *  - EVM (Ethereum, Polygon, BNB Chain) vía JSON-RPC público o el configurado
 *  - TRON vía TronGrid
 *  - Antigüedad en EVM vía Etherscan v2 si hay ETHERSCAN_API_KEY
 */
@Injectable()
export class OnchainService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private rpcUrl(network: Exclude<ChainNetwork, 'TRON'>) {
    return (
      { ETHEREUM: this.env.RPC_ETHEREUM_URL, POLYGON: this.env.RPC_POLYGON_URL, BSC: this.env.RPC_BSC_URL }[network] ??
      DEFAULT_RPC[network]
    );
  }

  private async rpc<T>(network: Exclude<ChainNetwork, 'TRON'>, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.rpcUrl(network), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`RPC ${network} HTTP ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC ${network}: ${json.error.message}`);
    return json.result as T;
  }

  private async tron<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.env.TRONGRID_URL ?? DEFAULT_TRONGRID}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(this.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': this.env.TRONGRID_API_KEY } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** ¿Está la dirección en la lista negra del emisor (Tether/Circle)? null = no aplica en esa red. */
  async issuerBlacklisted(network: ChainNetwork, asset: CryptoAsset, address: string): Promise<boolean | null> {
    const token = TOKENS[network][asset];
    if (!token?.blacklist) return null;
    const parsed = parseAddress(network, address);
    const arg = parsed.hex20.padStart(64, '0');
    if (network === 'TRON') {
      const r = await this.tron<{ constant_result?: string[]; result?: { result?: boolean; message?: string } }>(
        '/wallet/triggerconstantcontract',
        {
          owner_address: address,
          contract_address: token.address,
          function_selector: `${token.blacklist.fn}(address)`,
          parameter: arg,
          visible: true,
        },
      );
      const out = r.constant_result?.[0];
      if (!out) throw new Error('TronGrid no devolvió resultado');
      return BigInt(`0x${out}`) !== 0n;
    }
    const out = await this.rpc<string>(network, 'eth_call', [{ to: token.address, data: `0x${token.blacklist.selector}${arg}` }, 'latest']);
    return BigInt(out || '0x0') !== 0n;
  }

  async snapshot(network: ChainNetwork, asset: CryptoAsset, address: string): Promise<OnchainSnapshot> {
    const parsed = parseAddress(network, address);
    const token = TOKENS[network][asset];
    if (network === 'TRON') {
      const acc = await this.tron<{ data?: { create_time?: number; balance?: number; trc20?: Record<string, string>[] }[] }>(
        `/v1/accounts/${address}`,
      );
      const a = acc.data?.[0];
      if (!a) return { exists: false, firstSeenAt: null, tokenBalance: '0', nativeBalance: '0' };
      const trc20 = Object.assign({}, ...(a.trc20 ?? [])) as Record<string, string>;
      const raw = token ? trc20[token.address] : undefined;
      return {
        exists: true,
        firstSeenAt: a.create_time ? new Date(a.create_time).toISOString() : null,
        nativeBalance: formatUnits(BigInt(a.balance ?? 0), 6),
        tokenBalance: raw && token ? formatUnits(BigInt(raw), token.decimals) : '0',
      };
    }
    const [nonceHex, code, native, tokenRaw] = await Promise.all([
      this.rpc<string>(network, 'eth_getTransactionCount', [parsed.canonical, 'latest']),
      this.rpc<string>(network, 'eth_getCode', [parsed.canonical, 'latest']),
      this.rpc<string>(network, 'eth_getBalance', [parsed.canonical, 'latest']),
      token
        ? this.rpc<string>(network, 'eth_call', [{ to: token.address, data: `0x70a08231${parsed.hex20.padStart(64, '0')}` }, 'latest'])
        : Promise.resolve('0x0'),
    ]);
    const snap: OnchainSnapshot = {
      exists: true,
      outgoingTxCount: Number(BigInt(nonceHex)),
      isContract: !!code && code !== '0x',
      nativeBalance: formatUnits(BigInt(native), 18),
      tokenBalance: token ? formatUnits(BigInt(tokenRaw || '0x0'), token.decimals) : undefined,
      firstSeenAt: undefined,
    };
    snap.firstSeenAt = await this.evmFirstSeen(network, parsed.canonical).catch(() => undefined);
    return snap;
  }

  /** Busca una transacción y extrae las transferencias de tokens que contiene. */
  async lookupTx(network: ChainNetwork, hash: string): Promise<TxLookup> {
    const h = hash.trim().replace(/^0x/i, '').toLowerCase();
    if (network === 'TRON') {
      const info = await this.tron<{
        id?: string;
        blockNumber?: number;
        blockTimeStamp?: number;
        result?: string;
        receipt?: { result?: string };
        log?: { address: string; topics?: string[]; data?: string }[];
      }>('/wallet/gettransactioninfobyid', { value: h });
      if (!info.id) {
        const tx = await this.tron<{ txID?: string }>('/wallet/gettransactionbyid', { value: h });
        return { state: tx.txID ? 'pending' : 'not_found', transfers: [] };
      }
      const now = await this.tron<{ block_header?: { raw_data?: { number?: number } } }>('/wallet/getnowblock');
      const head = now.block_header?.raw_data?.number;
      const failed = info.result === 'FAILED' || (info.receipt?.result != null && info.receipt.result !== 'SUCCESS');
      const transfers: TokenTransfer[] = (info.log ?? [])
        .filter((l) => l.topics?.length === 3 && l.topics[0].replace(/^0x/, '') === TRANSFER_TOPIC)
        .map((l) => ({
          token: tronFromHex(l.address),
          from: tronFromHex(l.topics![1].slice(-40)),
          to: tronFromHex(l.topics![2].slice(-40)),
          raw: BigInt(`0x${(l.data || '0').replace(/^0x/, '') || '0'}`),
        }));
      return {
        state: failed ? 'failed' : 'success',
        blockNumber: info.blockNumber,
        timestamp: info.blockTimeStamp ? new Date(info.blockTimeStamp).toISOString() : undefined,
        confirmations: head != null && info.blockNumber != null ? Math.max(0, head - info.blockNumber + 1) : undefined,
        transfers,
      };
    }
    const txHash = `0x${h}`;
    const receipt = await this.rpc<{ status?: string; blockNumber?: string; logs?: EvmLog[] } | null>(network, 'eth_getTransactionReceipt', [txHash]);
    if (!receipt) {
      const tx = await this.rpc<unknown>(network, 'eth_getTransactionByHash', [txHash]);
      return { state: tx ? 'pending' : 'not_found', transfers: [] };
    }
    const blockNumber = receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : undefined;
    const [headHex, block] = await Promise.all([
      this.rpc<string>(network, 'eth_blockNumber', []),
      receipt.blockNumber ? this.rpc<{ timestamp?: string } | null>(network, 'eth_getBlockByNumber', [receipt.blockNumber, false]) : Promise.resolve(null),
    ]);
    const transfers: TokenTransfer[] = (receipt.logs ?? [])
      .filter((l) => l.topics.length === 3 && l.topics[0].replace(/^0x/, '').toLowerCase() === TRANSFER_TOPIC)
      .map((l) => ({
        token: l.address.toLowerCase(),
        from: `0x${l.topics[1].slice(-40).toLowerCase()}`,
        to: `0x${l.topics[2].slice(-40).toLowerCase()}`,
        raw: BigInt(l.data && l.data !== '0x' ? l.data : '0x0'),
      }));
    return {
      state: receipt.status === '0x1' ? 'success' : 'failed',
      blockNumber,
      timestamp: block?.timestamp ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : undefined,
      confirmations: blockNumber != null ? Math.max(0, Number(BigInt(headHex)) - blockNumber + 1) : undefined,
      transfers,
    };
  }

  /** Primera transacción conocida (Etherscan v2, multicadena). undefined si no hay API key. */
  private async evmFirstSeen(network: Exclude<ChainNetwork, 'TRON'>, address: string): Promise<string | null | undefined> {
    if (!this.env.ETHERSCAN_API_KEY) return undefined;
    const url = new URL('https://api.etherscan.io/v2/api');
    url.search = new URLSearchParams({
      chainid: String(EVM_CHAIN_ID[network]),
      module: 'account',
      action: 'tokentx',
      address,
      page: '1',
      offset: '1',
      sort: 'asc',
      apikey: this.env.ETHERSCAN_API_KEY,
    }).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    const json = (await res.json()) as { status: string; result: { timeStamp: string }[] | string };
    if (!Array.isArray(json.result) || !json.result.length) return null;
    return new Date(Number(json.result[0].timeStamp) * 1000).toISOString();
  }
}
