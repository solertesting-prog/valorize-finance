import { errorMessage, MfaSetupDto, passwordSchema, SessionDto } from '@valorize/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Platform, View } from 'react-native';
import { Badge, Body, Button, Card, Field, H2, Mono, Muted, Notice, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Security() {
  const { user, reload, logout } = useAuth();
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [setup, setSetup] = useState<MfaSetupDto | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionDto[]>('/auth/sessions') });
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });

  async function changePassword() {
    setPwError(null);
    const p = passwordSchema.safeParse(next);
    if (!p.success) return setPwError(p.error.issues[0].message);
    try {
      await api.post('/auth/password/change', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      Alert.alert('Contraseña cambiada', 'Hemos cerrado tus otras sesiones.');
    } catch (e) {
      setPwError(errorMessage(e));
    }
  }

  async function mfa(fn: () => Promise<void>) {
    setMfaError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMfaError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Verificación en dos pasos</H2>
          <Badge label={user.mfaEnabled ? 'Activada' : 'Desactivada'} tone={user.mfaEnabled ? 'ok' : 'warn'} />
        </Row>
        {recovery ? (
          <>
            <Notice kind="ok">Guarda estos códigos de recuperación: cada uno sirve una vez si pierdes el móvil.</Notice>
            <Mono selectable>{recovery.join('\n')}</Mono>
            <Button title="Ya los he guardado" variant="primary" onPress={() => setRecovery(null)} />
          </>
        ) : user.mfaEnabled ? (
          <Muted>Te pediremos un código de tu app de autenticación al iniciar sesión. Para desactivarla, entra desde la web.</Muted>
        ) : setup ? (
          <>
            <Muted>Abre tu app de autenticación y añade la cuenta con este enlace, o escanea el QR desde otro dispositivo.</Muted>
            <View style={{ alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 10 }}>
              <Image source={{ uri: setup.qrDataUrl }} style={{ width: 180, height: 180 }} accessibilityLabel="QR de configuración" />
            </View>
            <Button title="Abrir en mi app de autenticación" size="sm" onPress={() => Linking.openURL(setup.otpauthUrl)} />
            <Mono selectable style={{ fontSize: 13 }}>{setup.secret}</Mono>
            <Field label="Código de 6 dígitos" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} />
            <Button
              title="Activar"
              variant="primary"
              disabled={code.length !== 6}
              loading={busy}
              onPress={() =>
                mfa(async () => {
                  const r = await api.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code });
                  setRecovery(r.recoveryCodes);
                  setSetup(null);
                  setCode('');
                  await reload();
                })
              }
            />
          </>
        ) : (
          <>
            <Muted>Aunque alguien conozca tu contraseña, no podrá entrar sin tu móvil.</Muted>
            <Button title="Configurar" variant="primary" loading={busy} onPress={() => mfa(async () => setSetup(await api.post<MfaSetupDto>('/auth/mfa/setup')))} />
          </>
        )}
        {mfaError ? <Notice kind="error">{mfaError}</Notice> : null}
      </Card>

      <Card>
        <H2>Contraseña</H2>
        <Field label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Nueva contraseña" value={next} onChangeText={setNext} secureTextEntry hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." />
        {pwError ? <Notice kind="error">{pwError}</Notice> : null}
        <Button title="Cambiar contraseña" variant="primary" onPress={changePassword} />
      </Card>

      <Card>
        <H2>Sesiones abiertas</H2>
        {sessions.data?.map((s) => (
          <Row key={s.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Body>{s.current ? 'Este dispositivo' : (s.userAgent?.slice(0, 40) ?? 'Dispositivo')}</Body>
              <Muted style={{ fontSize: 12 }}>{new Date(s.createdAt).toLocaleDateString('es-ES')}</Muted>
            </View>
            {!s.current ? <Button title="Cerrar" size="sm" onPress={() => revoke.mutate(s.id)} /> : null}
          </Row>
        ))}
      </Card>

      <Card>
        <H2>Tus datos</H2>
        <Muted>Puedes descargar tus datos o eliminar tu cuenta desde la web, en Perfil, Seguridad.</Muted>
        <Button
          title="Eliminar mi cuenta"
          variant="danger"
          onPress={() =>
            Platform.OS !== 'ios'
              ? Alert.alert('Eliminar cuenta', 'Hazlo desde la web: Perfil, Seguridad y privacidad.')
              : Alert.prompt(
              'Eliminar cuenta',
              'Cancelaremos tus citas pendientes y borraremos tus datos. Escribe tu contraseña para confirmar.',
              async (password) => {
                try {
                  await api.post('/me/delete', { password });
                  await logout();
                  router.replace('/login');
                } catch (e) {
                  Alert.alert('No se pudo eliminar', errorMessage(e));
                }
              },
              'secure-text',
            )
          }
        />
      </Card>
    </Screen>
  );
}
