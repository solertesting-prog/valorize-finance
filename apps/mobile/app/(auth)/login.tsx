import { errorMessage } from '@valorize/shared';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { Body, Brand, Button, Card, Field, H1, Muted, Notice, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

export default function Login() {
  const { login, loginMfa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (challenge) {
        await loginMfa(challenge, code);
        router.replace('/');
      } else {
        const r = await login(email.trim(), password);
        if ('mfaRequired' in r) setChallenge(r.challengeToken);
        else router.replace('/');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Brand />
        <H1 style={{ marginTop: 32 }}>{challenge ? 'Verificación en dos pasos' : 'Entra en tu cuenta'}</H1>
        <Card big>
          {challenge ? (
            <>
              <Muted>Escribe el código de tu app de autenticación o un código de recuperación.</Muted>
              <Field label="Código" value={code} onChangeText={(v) => setCode(v.trim())} keyboardType="number-pad" autoFocus textContentType="oneTimeCode" maxLength={12} />
            </>
          ) : (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
              <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
            </>
          )}
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Button title={challenge ? 'Verificar' : 'Entrar'} variant="primary" size="lg" onPress={submit} loading={busy} />
          {challenge ? (
            <Button title="Volver" variant="ghost" onPress={() => setChallenge(null)} />
          ) : (
            <Row style={{ justifyContent: 'space-between' }}>
              <Link href="/forgot">
                <Body style={{ color: c.mint }}>He olvidado mi contraseña</Body>
              </Link>
              <Link href="/register">
                <Body style={{ color: c.mint }}>Crear cuenta</Body>
              </Link>
            </Row>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
