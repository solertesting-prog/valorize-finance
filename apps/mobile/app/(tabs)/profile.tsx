import { errorMessage, MeDto, updateProfileSchema } from '@valorize/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Body, Button, Card, Field, H1, H2, KycBadge, Muted, Notice, Row, Screen } from '@/components/ui';
import { MyWallets } from '@/components/exchange';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) setForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '' });
  }, [user]);
  if (!user) return null;

  async function save() {
    setError(null);
    const p = updateProfileSchema.safeParse({ ...form, phone: form.phone.replace(/\s/g, '') || undefined });
    if (!p.success) return setError(p.error.issues[0].message);
    setBusy(true);
    try {
      setUser(await api.patch<MeDto>('/me', p.data));
      Alert.alert('Datos guardados');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Perfil</H1>
      <Card onPress={() => router.push('/kyc')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ fontWeight: '700' }}>Verificación de identidad</Body>
          <KycBadge status={user.kycStatus} />
        </Row>
        <Muted>Necesaria para algunas gestiones presenciales.</Muted>
      </Card>
      <Card onPress={() => router.push('/verify')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>{user.email}</Body>
          <Badge label={user.emailVerified ? 'Verificado' : 'Verificar'} tone={user.emailVerified ? 'ok' : 'warn'} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>{user.phone ?? 'Sin teléfono'}</Body>
          <Badge label={user.phoneVerified ? 'Verificado' : 'Verificar'} tone={user.phoneVerified ? 'ok' : 'warn'} />
        </Row>
      </Card>
      <Card>
        <H2>Datos personales</H2>
        <Field label="Nombre" value={form.firstName} onChangeText={(v) => setForm({ ...form, firstName: v })} />
        <Field label="Apellidos" value={form.lastName} onChangeText={(v) => setForm({ ...form, lastName: v })} />
        <Field label="Teléfono móvil" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" hint="Si lo cambias, tendrás que verificarlo de nuevo." />
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Button title="Guardar cambios" variant="primary" onPress={save} loading={busy} />
      </Card>
      <Card>
        <H2>Mis wallets</H2>
        <MyWallets />
      </Card>
      <Card onPress={() => router.push('/security')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ fontWeight: '700' }}>Seguridad y privacidad</Body>
          <Badge label={user.mfaEnabled ? '2 pasos activo' : '2 pasos inactivo'} tone={user.mfaEnabled ? 'ok' : 'none'} />
        </Row>
        <Muted>Contraseña, verificación en dos pasos, sesiones y tus datos.</Muted>
      </Card>
      <Button
        title="Cerrar sesión"
        variant="ghost"
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
