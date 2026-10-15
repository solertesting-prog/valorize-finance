import { errorMessage, MeDto } from '@valorize/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Body, Brand, Button, Card, Field, H1, Muted, Notice, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Verify() {
  const { user, setUser, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  if (!user) return null;
  const done = user.emailVerified && user.phoneVerified;
  return (
    <Screen>
      <Brand />
      <H1 style={{ marginTop: 24 }}>Verifica tus datos</H1>
      <Muted>Los usamos para confirmarte las citas y avisarte de cualquier cambio.</Muted>
      <Channel channel="EMAIL" target={user.email} verified={user.emailVerified} onVerified={setUser} autoSent />
      <Channel channel="PHONE" target={user.phone ?? ''} verified={user.phoneVerified} onVerified={setUser} />
      <Button
        title={done ? 'Continuar' : user.emailVerified ? 'Hacerlo más tarde' : 'Continuar sin verificar'}
        variant={done ? 'primary' : 'ghost'}
        size={done ? 'lg' : undefined}
        onPress={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}

function Channel({ channel, target, verified, onVerified, autoSent }: { channel: 'EMAIL' | 'PHONE'; target: string; verified: boolean; onVerified: (u: MeDto) => void; autoSent?: boolean }) {
  const [sent, setSent] = useState(!!autoSent);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = channel === 'EMAIL' ? 'Email' : 'Teléfono';

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Muted>{label}</Muted>
          <Body>{target || 'Sin teléfono'}</Body>
        </View>
        {verified ? (
          <Badge label="Verificado" tone="ok" />
        ) : (
          <Button size="sm" title={sent ? 'Reenviar' : 'Enviar código'} loading={busy && !sent} onPress={() => run(async () => { await api.post('/auth/verify/send', { channel }); setSent(true); })} />
        )}
      </Row>
      {!verified && sent ? (
        <>
          <Field label="Código de 6 dígitos" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
          <Button title="Verificar" variant="primary" disabled={code.length !== 6} loading={busy} onPress={() => run(async () => onVerified(await api.post<MeDto>('/auth/verify/confirm', { channel, code })))} />
        </>
      ) : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </Card>
  );
}
