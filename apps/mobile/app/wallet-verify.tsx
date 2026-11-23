import { errorMessage, NETWORK_LABEL, WalletChallengeDto, WalletDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Body, Button, Card, Field, H2, Loader, Muted, Notice, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { c, f, t } from '@/theme';

/**
 * Demostrar que la wallet es del cliente: firmar un mensaje en la app de la wallet y pegar la firma,
 * o enviar una microtransferencia exacta y pegar el hash.
 */
export default function WalletVerify() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'sign' | 'transfer'>('sign');
  const [signature, setSignature] = useState('');
  const [txHash, setTxHash] = useState('');
  const ch = useQuery({ queryKey: ['wallet-challenge', id], queryFn: () => api.get<WalletChallengeDto>(`/me/wallets/${id}/challenge`), staleTime: 0 });
  const verify = useMutation({
    mutationFn: (body: { method: 'SIGNATURE'; signature: string } | { method: 'MICROTRANSFER'; txHash: string }) => api.post<WalletDto>(`/me/wallets/${id}/ownership`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'wallets'] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      router.back();
    },
  });
  if (ch.isLoading) return <Loader />;
  const cc = ch.data;
  if (!cc) return <Screen edges={['bottom']}><Notice kind="error">{errorMessage(ch.error)}</Notice></Screen>;

  return (
    <Screen edges={['bottom']}>
      <Body>
        Wallet en {NETWORK_LABEL[cc.network]}: <Text selectable style={{ fontFamily: f.brand }}>{cc.address}</Text>
      </Body>
      <Muted>La normativa europea nos pide comprobar que la wallet es tuya en operaciones de importe alto. Al firmar no se mueve ningún fondo.</Muted>
      <Row>
        <Button title="Firmar mensaje" size="sm" variant={mode === 'sign' ? 'primary' : 'default'} onPress={() => setMode('sign')} />
        {cc.microtransfer ? <Button title="Microtransferencia" size="sm" variant={mode === 'transfer' ? 'primary' : 'default'} onPress={() => setMode('transfer')} /> : null}
      </Row>

      {mode === 'sign' ? (
        <Card>
          <H2>1. Copia el mensaje</H2>
          <View style={{ backgroundColor: c.slate2, borderRadius: 10, padding: 10 }}>
            <Text selectable style={{ color: c.paper, fontFamily: f.brand, fontSize: t.xs }}>
              {cc.message}
            </Text>
          </View>
          <Button title="Compartir / copiar mensaje" size="sm" onPress={() => void Share.share({ message: cc.message })} />
          <H2>2. Fírmalo en tu wallet</H2>
          <Muted>
            En la app de tu wallet ({cc.signatureKind === 'tron' ? 'TronLink' : 'MetaMask, Trust Wallet…'}) busca «Firmar mensaje» (Sign message), pega el texto exacto y
            copia la firma.
          </Muted>
          <Field label="3. Pega la firma" value={signature} onChangeText={(v) => setSignature(v.trim())} autoCapitalize="none" autoCorrect={false} multiline placeholder="0x…" style={{ fontFamily: f.brand, minHeight: 80 }} />
          <Button title="Comprobar firma" variant="primary" loading={verify.isPending} disabled={signature.length < 130} onPress={() => verify.mutate({ method: 'SIGNATURE', signature })} />
        </Card>
      ) : cc.microtransfer ? (
        <Card>
          <Body>
            Envía desde esta wallet exactamente <Text style={{ fontFamily: f.brand, color: c.mint }}>{cc.microtransfer.amount} {cc.microtransfer.asset}</Text> por la red {NETWORK_LABEL[cc.network]} a:
          </Body>
          <Text selectable style={{ color: c.paper, fontFamily: f.brand, fontSize: t.sm }}>
            {cc.microtransfer.toAddress}
          </Text>
          <Field label="Hash de la transacción" value={txHash} onChangeText={(v) => setTxHash(v.trim())} autoCapitalize="none" autoCorrect={false} style={{ fontFamily: f.brand }} />
          <Button title="Comprobar transferencia" variant="primary" loading={verify.isPending} disabled={txHash.length < 64} onPress={() => verify.mutate({ method: 'MICROTRANSFER', txHash })} />
          <Muted style={{ fontSize: t.xs }}>Ese importe no se devuelve: es lo mínimo para demostrar que controlas la wallet.</Muted>
        </Card>
      ) : null}
      {verify.error ? <Notice kind="error">{errorMessage(verify.error)}</Notice> : null}
      <Muted style={{ fontSize: t.xs }}>El mensaje caduca el {new Date(cc.expiresAt).toLocaleString('es-ES')}.</Muted>
    </Screen>
  );
}
