'use client';

import type { CSSProperties } from 'react';
import {
  BookingDto,
  ChainNetwork,
  errorMessage,
  explorerLinks,
  NETWORK_LABEL,
  OPENSCAN_CHAIN_ID,
  relativeTime,
  TX_CHECK_LABEL,
  TxCheckStatus,
} from '@valorize/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CheckList, useExchangeSettings } from './exchange';
import { Alert, Button, useToast } from './ui';

const TX_TONE: Record<TxCheckStatus, string> = {
  VERIFIED: 'ok',
  WARNING: 'warn',
  PENDING: 'info',
  MISMATCH: 'bad',
  NOT_FOUND: 'bad',
  FAILED: 'bad',
  ERROR: 'warn',
};

export function TxCheckBadge({ status }: { status: TxCheckStatus | null | undefined }) {
  if (!status) return <span className="badge">Sin verificar</span>;
  return <span className={`badge ${TX_TONE[status]}`}>{TX_CHECK_LABEL[status]}</span>;
}

/** Botones para abrir una dirección o transacción en OpenScan (o en el explorador nativo si OpenScan no cubre la red). */
export function ExplorerButtons({ network, kind, value, size = 'sm' }: { network: ChainNetwork; kind: 'address' | 'tx'; value: string; size?: 'sm' }) {
  const openscan = useExchangeSettings().data?.openscanUrl;
  const l = explorerLinks(network, kind, value, openscan);
  return (
    <span className="row" style={{ gap: 6 }}>
      {l.openscan ? (
        <a className={`btn ${size} primary`} href={l.openscan} target="_blank" rel="noreferrer">
          OpenScan ↗
        </a>
      ) : null}
      <a className={`btn ${size}`} href={l.native} target="_blank" rel="noreferrer">
        {l.nativeName} ↗
      </a>
    </span>
  );
}

/**
 * Vista de OpenScan integrada en el backoffice.
 * OpenScan no cubre TRON: en ese caso se ofrece Tronscan en una pestaña nueva.
 */
export function OpenScanViewer({ network, kind, value, title }: { network: ChainNetwork; kind: 'address' | 'tx'; value: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const openscan = useExchangeSettings().data?.openscanUrl;
  const l = explorerLinks(network, kind, value, openscan);
  const label = title ?? (kind === 'tx' ? 'Transacción en OpenScan' : 'Wallet en OpenScan');

  if (!OPENSCAN_CHAIN_ID[network] || !l.openscan) {
    return (
      <div className="card flat row between" style={{ padding: 12 }}>
        <span className="small muted">OpenScan no cubre {NETWORK_LABEL[network]}. Revísalo en {l.nativeName}.</span>
        <ExplorerButtons network={network} kind={kind} value={value} />
      </div>
    );
  }
  return (
    <div className="card flat stack" style={{ padding: 12, '--gap': '10px' } as CSSProperties}>
      <div className="row between">
        <strong className="small">{label}</strong>
        <span className="row" style={{ gap: 6 }}>
          <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Ocultar' : 'Ver aquí'}
          </Button>
          <ExplorerButtons network={network} kind={kind} value={value} />
        </span>
      </div>
      {open ? (
        <>
          <iframe
            title={label}
            src={l.openscan}
            style={{ width: '100%', height: 640, border: '1px solid var(--line)', borderRadius: 12, background: '#fff' }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <p className="xs muted" style={{ margin: 0 }}>
            Si la vista aparece en blanco, el navegador está bloqueando la inserción: usa «OpenScan ↗» para abrirla en una pestaña.
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Resultado de la verificación on-chain de la transacción de una operación, con acceso a OpenScan. */
export function TxCheckPanel({ booking }: { booking: BookingDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const ex = booking.exchange!;
  const c = ex.txCheck;
  const verify = useMutation({
    mutationFn: () => api.post<BookingDto>(`/staff/bookings/${booking.id}/exchange/verify-tx`),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      toast(`Transacción: ${b.exchange?.txCheck ? TX_CHECK_LABEL[b.exchange.txCheck.status] : 'comprobada'}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (!ex.txHash) {
    return <p className="small muted" style={{ margin: 0 }}>Aún no se ha registrado la transacción. Se verificará al guardar el hash en la liquidación.</p>;
  }

  return (
    <div className="stack" style={{ '--gap': '12px' } as CSSProperties}>
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <strong className="small">Verificación de la transacción</strong>
          <TxCheckBadge status={c?.status} />
        </div>
        <div className="row" style={{ gap: 8 }}>
          {c ? <span className="xs muted">{relativeTime(c.checkedAt)}</span> : null}
          <Button size="sm" onClick={() => verify.mutate()} loading={verify.isPending}>
            Comprobar de nuevo
          </Button>
        </div>
      </div>
      {c ? (
        <>
          <dl className="grid" style={{ '--min': '140px', margin: 0, gap: 10 } as CSSProperties}>
            {c.transfer ? (
              <>
                <Item label="Importe transferido" value={`${c.transfer.amount} ${c.transfer.token}`} mono />
                <Item label="Origen" value={c.transfer.from} mono small />
                <Item label="Destino" value={c.transfer.to} mono small />
              </>
            ) : null}
            <Item label="Bloque" value={c.blockNumber != null ? String(c.blockNumber) : '—'} mono />
            <Item label="Confirmaciones" value={c.confirmations != null ? `${c.confirmations} / ${c.requiredConfirmations}` : '—'} mono />
            <Item label="Fecha en la red" value={c.timestamp ? new Date(c.timestamp).toLocaleString('es-ES') : '—'} />
          </dl>
          <CheckList checks={c.checks} />
          {c.status === 'MISMATCH' || c.status === 'FAILED' || c.status === 'NOT_FOUND' ? (
            <Alert kind="error">La transacción no cuadra con la operación. No des la operación por cerrada hasta revisarla.</Alert>
          ) : null}
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Aún sin comprobar.
        </p>
      )}
      <OpenScanViewer network={ex.network} kind="tx" value={ex.txHash} />
    </div>
  );
}

function Item({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt className="xs muted">{label}</dt>
      <dd className={`${mono ? 'mono' : ''} ${small ? 'small' : ''}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>
        {value}
      </dd>
    </div>
  );
}
