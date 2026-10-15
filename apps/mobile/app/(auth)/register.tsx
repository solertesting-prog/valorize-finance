import type React from 'react';
import { errorMessage, registerSchema } from '@valorize/shared';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Switch, Text, View } from 'react-native';
import { Body, Brand, Button, Card, Field, H1, Notice, Screen, s } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';
import * as Linking from 'expo-linking';

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '+34', password: '' });
  const [acceptTerms, setAccept] = useState(false);
  const [marketingOptIn, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function submit() {
    setError(null);
    const data = { ...form, email: form.email.trim(), phone: form.phone.replace(/\s/g, ''), acceptTerms, marketingOptIn, client: 'mobile' };
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErrors(errs);
    }
    setErrors({});
    setBusy(true);
    try {
      await register(data);
      router.replace('/verify');
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
        <H1 style={{ marginTop: 24 }}>Crea tu cuenta</H1>
        <Card big>
          <Field label="Nombre" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} autoComplete="given-name" />
          <Field label="Apellidos" value={form.lastName} onChangeText={set('lastName')} error={errors.lastName} autoComplete="family-name" />
          <Field label="Email" value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field label="Teléfono móvil" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" hint="Con prefijo internacional." />
          <Field label="Contraseña" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry autoComplete="new-password" hint="Mínimo 10 caracteres, con mayúscula, minúscula y número." />
          <Toggle value={acceptTerms} onChange={setAccept}>
            <Text style={[s.small, { color: c.paper }]}>
              Acepto las{' '}
              <Text style={{ color: c.mint }} onPress={() => Linking.openURL('https://valorize.finance/legal/condiciones')}>
                condiciones
              </Text>{' '}
              y la{' '}
              <Text style={{ color: c.mint }} onPress={() => Linking.openURL('https://valorize.finance/legal/privacidad')}>
                política de privacidad
              </Text>
              .
            </Text>
          </Toggle>
          {errors.acceptTerms ? <Text style={[s.small, { color: c.coral }]}>{errors.acceptTerms}</Text> : null}
          <Toggle value={marketingOptIn} onChange={setMarketing}>
            <Text style={[s.small, { color: c.paper }]}>Quiero recibir novedades de Valorize por email.</Text>
          </Toggle>
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Button title="Crear cuenta" variant="primary" size="lg" onPress={submit} loading={busy} />
          <Link href="/login" style={{ alignSelf: 'center' }}>
            <Body style={{ color: c.mint }}>Ya tengo cuenta</Body>
          </Link>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Toggle({ value, onChange, children }: { value: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.mint, false: c.line }} thumbColor={c.paper} />
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}
