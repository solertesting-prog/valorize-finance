'use client';

import type React from 'react';
import { ChainNetwork, CryptoAsset, errorMessage, ExchangeSettingsDto, NETWORK_LABEL } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, ErrorBox, Spinner, TextInput, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Ajustes del servicio de cambio USDT/USDC. */
export default function ExchangeSettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'exchange-settings'], queryFn: () => api.get<ExchangeSettingsDto>('/admin/exchange-settings') });
  const [f, setF] = useState<ExchangeSettingsDto | null>(null);
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put<ExchangeSettingsDto>('/admin/exchange-settings', f),
    onSuccess: (d) => {
      qc.setQueryData(['admin', 'exchange-settings'], d);
      qc.invalidateQueries({ queryKey: ['exchange-settings'] });
      toast('Ajustes guardados');
    },
  });
  if (q.isLoading || !f) return q.error ? <div className="page"><ErrorBox error={q.error} /></div> : <Spinner />;
  const readOnly = user?.role !== 'ADMIN';
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Cambio USDT / USDC</h1>
          <p className="muted">Qué operaciones se aceptan y con qué límites.</p>
        </div>
      </div>
      <form
        className="stack"
        style={{ '--gap': '20px' } as React.CSSProperties}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="card stack" disabled={readOnly} style={{ margin: 0 }}>
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Operaciones</h2>
          <label className="check">
            <input type="checkbox" checked={f.sellEnabled} onChange={(e) => setF({ ...f, sellEnabled: e.target.checked })} />
            <span>El cliente vende cripto y recibe euros</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={f.buyEnabled} onChange={(e) => setF({ ...f, buyEnabled: e.target.checked })} />
            <span>El cliente compra cripto pagando en euros</span>
          </label>
          <div className="row">
            {(['USDT', 'USDC'] as CryptoAsset[]).map((a) => (
              <label key={a} className="check">
                <input type="checkbox" checked={f.enabledAssets.includes(a)} onChange={() => setF({ ...f, enabledAssets: toggle(f.enabledAssets, a) })} />
                <span>{a}</span>
              </label>
            ))}
          </div>
          <div className="grid" style={{ '--min': '200px', gap: 8 } as React.CSSProperties}>
            {(Object.keys(NETWORK_LABEL) as ChainNetwork[]).map((n) => (
              <label key={n} className="check">
                <input type="checkbox" checked={f.enabledNetworks.includes(n)} onChange={() => setF({ ...f, enabledNetworks: toggle(f.enabledNetworks, n) })} />
                <span>{NETWORK_LABEL[n]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card stack" disabled={readOnly} style={{ margin: 0 }}>
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Límites por cliente (en unidades de USDT/USDC)</h2>
          <div className="grid" style={{ '--min': '180px' } as React.CSSProperties}>
            <TextInput label="Mínimo por operación" inputMode="decimal" value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} />
            <TextInput label="Máximo por operación" inputMode="decimal" value={f.maxAmount} onChange={(e) => setF({ ...f, maxAmount: e.target.value })} />
            <TextInput label="Límite diario" inputMode="decimal" value={f.dailyLimitPerUser} onChange={(e) => setF({ ...f, dailyLimitPerUser: e.target.value })} />
            <TextInput label="Límite mensual" inputMode="decimal" value={f.monthlyLimitPerUser} onChange={(e) => setF({ ...f, monthlyLimitPerUser: e.target.value })} />
          </div>
        </fieldset>

        <fieldset className="card stack" disabled={readOnly} style={{ margin: 0 }}>
          <h2 style={{ fontSize: 'var(--t-lg)', margin: 0 }}>Prevención de blanqueo</h2>
          <div className="grid" style={{ '--min': '200px' } as React.CSSProperties}>
            <TextInput
              label="Verificación ampliada por encima de"
              inputMode="decimal"
              value={f.enhancedKycAbove}
              onChange={(e) => setF({ ...f, enhancedKycAbove: e.target.value })}
              hint="Exige KYC de nivel 2 al cliente."
            />
            <TextInput
              label="Antigüedad mínima de la wallet (días)"
              type="number"
              min={0}
              value={f.minWalletAgeDays}
              onChange={(e) => setF({ ...f, minWalletAgeDays: Number(e.target.value) })}
              hint="Más nueva genera un aviso en la auditoría."
            />
          </div>
        </fieldset>

        {save.error ? <Alert kind="error">{errorMessage(save.error)}</Alert> : null}
        {readOnly ? (
          <p className="small muted">Solo un administrador puede cambiar estos ajustes.</p>
        ) : (
          <div>
            <Button variant="primary" type="submit" loading={save.isPending}>
              Guardar ajustes
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
