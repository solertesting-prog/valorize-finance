import { errorMessage, passwordSchema } from '@valorize/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Brand, Button, Card, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';

export default function Forgot() {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (step === 'email') {
        await api.post('/auth/password/forgot', { email: email.trim() }, { skipAuthRetry: true });
        setStep('code');
      } else {
        const p = passwordSchema.safeParse(password);
        if (!p.success) throw new Error(p.error.issues[0].message);
        await api.post('/auth/password/reset', { email: email.trim(), code, password }, { skipAuthRetry: true });
        setStep('done');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Brand />
      <H1 style={{ marginTop: 24 }}>{step === 'done' ? 'Contraseña cambiada' : 'Restablecer contraseña'}</H1>
      <Card big>
        {step === 'email' ? (
          <>
            <Muted>Te enviaremos un código de 6 dígitos a tu email.</Muted>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </>
        ) : step === 'code' ? (
          <>
            <Notice>Si existe una cuenta con ese email, te hemos enviado un código. Caduca en 10 minutos.</Notice>
            <Field label="Código" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
            <Field label="Nueva contraseña" value={password} onChangeText={setPassword} secureTextEntry hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." />
          </>
        ) : (
          <Notice kind="ok">Ya puedes entrar con tu nueva contraseña.</Notice>
        )}
        {error ? <Notice kind="error">{error}</Notice> : null}
        {step === 'done' ? (
          <Button title="Entrar" variant="primary" size="lg" onPress={() => router.replace('/login')} />
        ) : (
          <Button title={step === 'email' ? 'Enviar código' : 'Cambiar contraseña'} variant="primary" size="lg" onPress={submit} loading={busy} />
        )}
        <Button title="Volver" variant="ghost" onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}
