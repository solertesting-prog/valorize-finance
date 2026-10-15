import {
  ChainNetwork,
  CryptoAsset,
  DIRECTION_LABEL,
  DIRECTION_SHORT,
  ExchangeDirection,
  ExchangeDto,
  ExchangeSettingsDto,
  explorerLinks,
  NETWORK_LABEL,
  walletAddressShape,
  WalletDto,
} from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { c, f, r, t } from '../theme';
import { Button, Choice, Field, Loader, Muted } from './ui';

export interface ExchangeDraft {
  direction: ExchangeDirection;
  asset: CryptoAsset;
  network: ChainNetwork;
  amount: string;
  walletId: string | null;
  newAddress: string;
  newLabel: string;
}

export const emptyExchange = (s?: ExchangeSettingsDto): ExchangeDraft => ({
  direction: s && !s.sellEnabled ? 'BUY_CRYPTO' : 'SELL_CRYPTO',
  asset: s?.enabledAssets[0] ?? 'USDT',
  network: s?.enabledNetworks[0] ?? 'TRON',
  amount: '',
  walletId: null,
  newAddress: '',
  newLabel: '',
});

export function exchangeError(d: ExchangeDraft, s: ExchangeSettingsDto | undefined): string | null {
  const n = Number(d.amount.replace(',', '.'));
  if (!d.amount || !Number.isFinite(n) || n <= 0) return 'Indica el importe';
  if (s && n < Number(s.minAmount)) return `El mínimo es ${s.minAmount} ${d.asset}`;
  if (s && n > Number(s.maxAmount)) return `El máximo por operación es ${s.maxAmount} ${d.asset}`;
  if (!d.walletId) {
    if (!d.newAddress.trim()) return 'Indica la dirección de tu wallet';
    if (!walletAddressShape[d.network].test(d.newAddress.trim())) {
      return d.network === 'TRON' ? 'Una dirección TRON empieza por T y tiene 34 caracteres' : 'La dirección debe empezar por 0x y tener 42 caracteres';
    }
  }
  return null;
}

export function exchangePayload(d: ExchangeDraft) {
  return {
    direction: d.direction,
    asset: d.asset,
    network: d.network,
    amount: d.amount.replace(',', '.'),
    ...(d.walletId ? { walletId: d.walletId } : { wallet: { network: d.network, address: d.newAddress.trim(), label: d.newLabel || undefined } }),
  };
}

export function useExchangeSettings() {
  return useQuery({ queryKey: ['exchange-settings'], queryFn: () => api.get<ExchangeSettingsDto>('/exchange/settings'), staleTime: 300_000 });
}

export const shortAddress = (a: string) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: r.sm,
        borderWidth: 1,
        borderColor: selected ? c.mint : c.line,
        backgroundColor: selected ? c.mint : c.slate2,
      }}
    >
      <Text style={{ fontFamily: f.uiBold, fontSize: t.sm, color: selected ? c.mintInk : c.paper }}>{label}</Text>
    </Pressable>
  );
}

const Label = ({ children }: { children: string }) => <Text style={{ fontFamily: f.uiBold, fontSize: t.sm, color: c.paper }}>{children}</Text>;

/** Paso "Operación": qué, cuánto, en qué red y con qué wallet. */
export function ExchangeForm({ value, onChange }: { value: ExchangeDraft; onChange: (d: ExchangeDraft) => void }) {
  const settings = useExchangeSettings();
  const wallets = useQuery({
    queryKey: ['me', 'wallets', value.network],
    queryFn: () => api.get<WalletDto[]>('/me/wallets', { query: { network: value.network } }),
  });
  const s = settings.data;
  if (!s) return <Loader />;
  const set = (p: Partial<ExchangeDraft>) => onChange({ ...value, ...p });
  const directions = (['SELL_CRYPTO', 'BUY_CRYPTO'] as const).filter((d) => (d === 'SELL_CRYPTO' ? s.sellEnabled : s.buyEnabled));

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Label>¿Qué quieres hacer?</Label>
        {directions.map((d) => (
          <Choice
            key={d}
            title={DIRECTION_LABEL[d]}
            subtitle={d === 'SELL_CRYPTO' ? 'Nos envías USDT/USDC en la oficina y te pagamos en euros.' : 'Pagas en euros en la oficina y te enviamos USDT/USDC a tu wallet.'}
            selected={value.direction === d}
            onPress={() => set({ direction: d })}
          />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Label>Moneda</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {s.enabledAssets.map((a) => (
            <Pill key={a} label={a} selected={value.asset === a} onPress={() => set({ asset: a })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Red</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {s.enabledNetworks.map((n) => (
            <Pill key={n} label={NETWORK_LABEL[n]} selected={value.network === n} onPress={() => set({ network: n, walletId: null })} />
          ))}
        </View>
      </View>

      <Field
        label={`Importe en ${value.asset}`}
        keyboardType="decimal-pad"
        placeholder={`${s.minAmount} – ${s.maxAmount}`}
        value={value.amount}
        onChangeText={(v) => set({ amount: v.replace(/[^\d.,]/g, '') })}
        hint={`Entre ${s.minAmount} y ${s.maxAmount} ${value.asset} por operación. Por encima de ${s.enhancedKycAbove} se pide la verificación ampliada.`}
        style={{ fontFamily: f.brand, fontSize: t.xl }}
      />

      <View style={{ gap: 8 }}>
        <Label>{value.direction === 'SELL_CRYPTO' ? `Wallet desde la que enviarás los ${value.asset}` : `Wallet en la que recibirás los ${value.asset}`}</Label>
        {wallets.data?.map((w: WalletDto) => (
          <Choice key={w.id} title={w.label ?? 'Mi wallet'} subtitle={shortAddress(w.address)} selected={value.walletId === w.id} onPress={() => set({ walletId: w.id })} />
        ))}
        <Choice title={wallets.data?.length ? 'Usar otra wallet' : 'Añadir mi wallet'} selected={value.walletId === null} onPress={() => set({ walletId: null })} />
        {value.walletId === null ? (
          <View style={{ gap: 12, backgroundColor: c.slate, borderColor: c.line, borderWidth: 1, borderRadius: r.md, padding: 14 }}>
            <Field
              label={`Dirección (${NETWORK_LABEL[value.network]})`}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={value.network === 'TRON' ? 'T…' : '0x…'}
              value={value.newAddress}
              onChangeText={(v) => set({ newAddress: v.trim() })}
              hint={`Cópiala de tu wallet. Comprueba que es de la red ${NETWORK_LABEL[value.network]}: si eliges otra red, los fondos se pueden perder.`}
              style={{ fontFamily: f.brand, fontSize: t.sm }}
            />
            <Field label="Nombre para recordarla (opcional)" maxLength={60} placeholder="Trust Wallet, Ledger…" value={value.newLabel} onChangeText={(v) => set({ newLabel: v })} />
          </View>
        ) : null}
        <Muted style={{ fontSize: t.xs }}>Revisamos cada wallet antes de aprobar la operación, como exige la normativa de prevención de blanqueo.</Muted>
      </View>
    </View>
  );
}

function Item({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <View style={{ width: wide ? '100%' : '50%', paddingVertical: 6, paddingRight: 8 }}>
      <Text style={{ color: c.fog, fontFamily: f.ui, fontSize: t.xs }}>{label}</Text>
      <Text selectable style={{ color: c.paper, fontFamily: mono ? f.brand : f.uiBold, fontSize: mono && !wide ? t.lg : t.sm }}>
        {value}
      </Text>
    </View>
  );
}

/** Resumen de la operación para el cliente (nunca muestra el resultado de la auditoría). */
export function ExchangeSummary({ ex }: { ex: ExchangeDto }) {
  const openscan = useExchangeSettings().data?.openscanUrl;
  const tx = ex.txHash ? explorerLinks(ex.network, 'tx', ex.txHash, openscan) : null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      <Item label="Operación" value={DIRECTION_SHORT[ex.direction]} />
      <Item label="Importe" value={`${ex.amount} ${ex.asset}`} mono />
      <Item label="Red" value={NETWORK_LABEL[ex.network]} />
      {ex.fiatAmount ? <Item label="Importe en euros" value={`${ex.fiatAmount} €${ex.agreedRate ? ` (a ${ex.agreedRate})` : ''}`} /> : null}
      <Item label={`Wallet${ex.wallet.label ? ` · ${ex.wallet.label}` : ''}`} value={ex.wallet.address} mono wide />
      {ex.txHash ? (
        <Pressable accessibilityRole="link" onPress={() => tx && Linking.openURL(tx.openscan ?? tx.native)} style={{ width: '100%', paddingVertical: 6 }}>
          <Text style={{ color: c.fog, fontFamily: f.ui, fontSize: t.xs }}>Transacción · ver en {tx?.openscan ? 'OpenScan' : tx?.nativeName}</Text>
          <Text style={{ color: c.mint, fontFamily: f.brand, fontSize: t.sm }}>{shortAddress(ex.txHash)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Lista de wallets guardadas del cliente, con opción de retirarlas. */
export function MyWallets() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'wallets', 'all'], queryFn: () => api.get<WalletDto[]>('/me/wallets') });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/me/wallets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'wallets'] }),
  });
  if (q.isLoading) return <Loader />;
  if (!q.data?.length) return <Muted>Aún no has añadido ninguna. Se guardan al solicitar un cambio de USDT/USDC.</Muted>;
  return (
    <View style={{ gap: 10 }}>
      {q.data.map((w) => (
        <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: f.uiBold, fontSize: t.sm, color: c.paper }}>
              {w.label ?? 'Mi wallet'} · {NETWORK_LABEL[w.network]}
            </Text>
            <Text selectable style={{ fontFamily: f.brand, fontSize: t.xs, color: c.fog }}>
              {shortAddress(w.address)}
            </Text>
          </View>
          <Button
            title="Quitar"
            size="sm"
            variant="ghost"
            loading={archive.isPending && archive.variables === w.id}
            onPress={() =>
              Alert.alert('¿Quitar esta wallet?', 'No afecta a las solicitudes que ya has enviado.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Quitar', style: 'destructive', onPress: () => archive.mutate(w.id) },
              ])
            }
          />
        </View>
      ))}
    </View>
  );
}
