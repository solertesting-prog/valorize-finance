'use client';

import type { CSSProperties } from 'react';
import { errorMessage, NETWORK_LABEL, WalletChallengeDto, WalletDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Button, Modal, TextArea, TextInput, useToast } from './ui';

type Injected = {
  ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  tronWeb?: { defaultAddress?: { base58?: string }; trx?: { signMessageV2?: (m: string) => Promise<string> } };
  tronLink?: { request: (a: { method: string }) => Promise<unknown> };
};

/** Estado de la prueba de propiedad de una wallet, con botón para hacerla. */
export function OwnershipBadge({ wallet }: { wallet: Pick<WalletDto, 'ownershipVerifiedAt'> }) {
  return wallet.ownershipVerifiedAt ? <span className="badge ok">Propiedad verificada</span> : <span className="badge warn">Propiedad sin verificar</span>;
}

/**
 * Demostrar que la wallet es del cliente:
 *  1. Firmar un mensaje: con MetaMask / TronLink desde el navegador, o pegando la firma hecha en la app de la wallet.
 *  2. Alternativa: enviar una microtransferencia exacta a una dirección de Valorize y pegar el hash.
 * Lo exige la normativa europea de transferencias a partir de cierto importe.
 */
export function OwnershipModal({ walletId, onClose, onDone }: { walletId: string; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'sign' | 'transfer'>('sign');
  const [signature, setSignature] = useState('');
  const [txHash, setTxHash] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const ch = useQuery({ queryKey: ['wallet-challenge', walletId], queryFn: () => api.get<WalletChallengeDto>(`/me/wallets/${walletId}/challenge`), staleTime: 0 });
  const verify = useMutation({
    mutationFn: (body: { method: 'SIGNATURE'; signature: string } | { method: 'MICROTRANSFER'; txHash: string }) =>
      api.post<WalletDto>(`/me/wallets/${walletId}/ownership`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      toast('Wallet verificada: queda demostrado que es tuya.');
      onDone?.();
      onClose();
    },
  });
  const c = ch.data;
  const w = (typeof window !== 'undefined' ? window : {}) as Injected;

  async function signInBrowser() {
    if (!c) return;
    setSigning(true);
    setSignError(null);
    try {
      let sig: string;
      if (c.signatureKind === 'evm') {
        const [account] = (await w.ethereum!.request({ method: 'eth_requestAccounts' })) as string[];
        if (account.toLowerCase() !== c.address.toLowerCase()) throw new Error(`En MetaMask está activa ${account}. Cambia a ${c.address} y vuelve a intentarlo.`);
        const hex = `0x${Array.from(new TextEncoder().encode(c.message), (b) => b.toString(16).padStart(2, '0')).join('')}`;
        sig = (await w.ethereum!.request({ method: 'personal_sign', params: [hex, account] })) as string;
      } else {
        await w.tronLink?.request({ method: 'tron_requestAccounts' }).catch(() => undefined);
        const active = w.tronWeb?.defaultAddress?.base58;
        if (active && active !== c.address) throw new Error(`En TronLink está activa ${active}. Cambia a ${c.address} y vuelve a intentarlo.`);
        sig = await w.tronWeb!.trx!.signMessageV2!(c.message);
      }
      setSignature(sig);
      verify.mutate({ method: 'SIGNATURE', signature: sig });
    } catch (e) {
      setSignError((e as Error).message || 'No se ha podido firmar.');
    } finally {
      setSigning(false);
    }
  }

  const hasBrowserWallet = c ? (c.signatureKind === 'evm' ? !!w.ethereum : !!w.tronWeb?.trx?.signMessageV2) : false;

  return (
    <Modal open onClose={onClose} title="Demuestra que la wallet es tuya">
      <div className="stack">
        {ch.isLoading ? <p className="small muted">Preparando…</p> : null}
        {ch.error ? <Alert kind="error">{errorMessage(ch.error)}</Alert> : null}
        {c ? (
          <>
            <p className="small" style={{ margin: 0 }}>
              Wallet <span className="mono">{c.address}</span> ({NETWORK_LABEL[c.network]}). La normativa europea nos pide comprobarlo en operaciones de
              importe alto. No se mueve ningún fondo al firmar.
            </p>
            <div className="row" role="tablist" style={{ gap: 6 }}>
              <button role="tab" aria-selected={tab === 'sign'} className={`btn sm ${tab === 'sign' ? 'primary' : ''}`} onClick={() => setTab('sign')}>
                Firmar un mensaje
              </button>
              {c.microtransfer ? (
                <button role="tab" aria-selected={tab === 'transfer'} className={`btn sm ${tab === 'transfer' ? 'primary' : ''}`} onClick={() => setTab('transfer')}>
                  Microtransferencia
                </button>
              ) : null}
            </div>

            {tab === 'sign' ? (
              <div className="stack" style={{ '--gap': '10px' } as CSSProperties}>
                {hasBrowserWallet ? (
                  <Button variant="primary" loading={signing || verify.isPending} onClick={signInBrowser}>
                    Firmar con {c.signatureKind === 'evm' ? 'MetaMask' : 'TronLink'}
                  </Button>
                ) : null}
                <p className="small muted" style={{ margin: 0 }}>
                  {hasBrowserWallet ? 'O, desde la app de tu wallet, ' : 'Desde la app de tu wallet, '}busca «Firmar mensaje» (Sign message), pega este texto
                  exacto y copia aquí la firma:
                </p>
                <pre className="mono xs" style={{ whiteSpace: 'pre-wrap', background: 'var(--slate-2)', padding: 10, borderRadius: 10, margin: 0 }}>{c.message}</pre>
                <div>
                  <Button size="sm" onClick={() => void navigator.clipboard?.writeText(c.message).then(() => toast('Mensaje copiado'))}>
                    Copiar mensaje
                  </Button>
                </div>
                <TextArea label="Firma" className="textarea mono" rows={3} value={signature} onChange={(e) => setSignature(e.target.value.trim())} placeholder="0x…" />
                {signError ? <Alert kind="error">{signError}</Alert> : null}
                <Button variant={hasBrowserWallet ? 'default' : 'primary'} loading={verify.isPending} disabled={signature.length < 130} onClick={() => verify.mutate({ method: 'SIGNATURE', signature })}>
                  Comprobar firma
                </Button>
              </div>
            ) : c.microtransfer ? (
              <div className="stack" style={{ '--gap': '10px' } as CSSProperties}>
                <p className="small" style={{ margin: 0 }}>
                  Envía desde esta wallet <strong className="mono">exactamente {c.microtransfer.amount} {c.microtransfer.asset}</strong> por la red{' '}
                  {NETWORK_LABEL[c.network]} a:
                </p>
                <pre className="mono xs" style={{ whiteSpace: 'pre-wrap', background: 'var(--slate-2)', padding: 10, borderRadius: 10, margin: 0, wordBreak: 'break-all' }}>
                  {c.microtransfer.toAddress}
                </pre>
                <TextInput label="Hash de la transacción" className="input mono" value={txHash} onChange={(e) => setTxHash(e.target.value.trim())} />
                <Button variant="primary" loading={verify.isPending} disabled={txHash.length < 64} onClick={() => verify.mutate({ method: 'MICROTRANSFER', txHash })}>
                  Comprobar transferencia
                </Button>
                <p className="xs muted" style={{ margin: 0 }}>Ese importe no se devuelve: es lo mínimo para demostrar el control de la wallet.</p>
              </div>
            ) : null}
            {verify.error ? <Alert kind="error">{errorMessage(verify.error)}</Alert> : null}
            <p className="xs muted" style={{ margin: 0 }}>El mensaje caduca el {new Date(c.expiresAt).toLocaleString('es-ES')}.</p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
