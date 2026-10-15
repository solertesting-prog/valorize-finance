import { errorMessage, KycProfileDto, KycRequirementDto } from '@valorize/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { Badge, Body, Button, Card, Field, H2, KycBadge, Loader, Muted, Notice, Row, Screen, s } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

type V = { value: string | null; fileId: string | null; fileName: string | null };
const COUNTRIES = ['ES', 'AD', 'FR', 'PT', 'IT', 'DE', 'GB', 'IE', 'NL', 'BE', 'CH', 'US', 'MX', 'AR', 'CO', 'VE', 'PE', 'CL', 'EC', 'BR', 'MA', 'RO', 'CN', 'PK', 'IN', 'UA'];

export default function Kyc() {
  const { reload } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['kyc'], queryFn: () => api.get<KycProfileDto>('/me/kyc') });
  const [values, setValues] = useState<Partial<Record<string, V>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);

  useEffect(() => {
    if (q.data) setValues(Object.fromEntries(q.data.fields.map((f) => [f.key, f])));
  }, [q.data]);

  if (q.isLoading) return <Loader />;
  const p = q.data;
  if (!p) return <Screen edges={['bottom']}><Notice kind="error">{errorMessage(q.error)}</Notice></Screen>;
  const editable = ['NOT_STARTED', 'PENDING', 'REJECTED', 'EXPIRED'].includes(p.status);
  // Cliente ya verificado que puede completar la verificación ampliada.
  const upgrading = p.status === 'APPROVED' && !p.upgradeRequestedAt && p.level < p.maxLevel;

  async function persist(submit: boolean) {
    setError(null);
    setErrors({});
    setBusy(submit ? 'submit' : 'save');
    try {
      const fields = p!.requirements.filter((r) => values[r.key] && (!upgrading || r.level > p!.level)).map((r) => ({ key: r.key, value: values[r.key]?.value ?? null, fileId: values[r.key]?.fileId ?? null }));
      qc.setQueryData(['kyc'], await api.put<KycProfileDto>('/me/kyc', { fields, submit }));
      await reload();
      Alert.alert(submit ? 'Enviado a revisión' : 'Borrador guardado', submit ? 'Te avisaremos cuando esté listo.' : undefined);
    } catch (e) {
      const details = (e as { details?: { path: string; message: string }[] }).details;
      if (Array.isArray(details)) setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const set = (key: string, v: Partial<V>) => setValues((s) => ({ ...s, [key]: { value: null, fileId: null, fileName: null, ...s[key], ...v } }));

  return (
    <Screen edges={['bottom']}>
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>Tu estado</H2>
        <KycBadge status={p.status} />
      </Row>
      {p.status === 'IN_REVIEW' ? <Notice>Estamos revisando tus datos. Normalmente tardamos menos de 24 horas laborables.</Notice> : null}
      {p.status === 'APPROVED' ? (
        <Notice kind="ok">{`Tu identidad está verificada${p.level >= 2 ? ' con la verificación ampliada' : ''}${p.expiresAt ? ` hasta el ${new Date(p.expiresAt).toLocaleDateString('es-ES')}` : ''}.`}</Notice>
      ) : null}
      {p.status === 'APPROVED' && p.upgradeRequestedAt ? <Notice>Estamos revisando tu verificación ampliada. Mientras tanto puedes seguir reservando.</Notice> : null}
      {p.status === 'APPROVED' && p.rejectionReason && !p.upgradeRequestedAt ? (
        <Notice kind="error">{`No hemos podido aprobar la verificación ampliada: ${p.rejectionReason}.`}</Notice>
      ) : null}
      {upgrading ? <Muted>Para operaciones de importe alto necesitamos la verificación ampliada: completa los datos marcados y envíalos.</Muted> : null}
      {p.status === 'REJECTED' ? <Notice kind="error">{`No hemos podido verificarte: ${p.rejectionReason}. Corrige los datos y envíalos de nuevo.`}</Notice> : null}
      {p.status === 'EXPIRED' ? <Notice kind="warn">Tu verificación ha caducado. Actualiza tu documento.</Notice> : null}
      {editable ? <Muted>Tus datos se guardan cifrados y solo los ve el equipo de verificación.</Muted> : null}
      {p.requirements.map((r) => (
        <KycInput key={r.key} req={r} v={values[r.key]} error={errors[r.key]} editable={editable || (upgrading && r.level > p.level)} onChange={(v) => set(r.key, v)} />
      ))}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {upgrading ? (
        <>
          <Button title="Solicitar verificación ampliada" variant="primary" size="lg" loading={busy === 'submit'} onPress={() => persist(true)} />
          <Button title="Guardar borrador" loading={busy === 'save'} onPress={() => persist(false)} />
        </>
      ) : null}
      {editable ? (
        <>
          <Button title="Enviar a revisión" variant="primary" size="lg" loading={busy === 'submit'} onPress={() => persist(true)} />
          <Button title="Guardar borrador" loading={busy === 'save'} onPress={() => persist(false)} />
        </>
      ) : null}
    </Screen>
  );
}

function KycInput({ req, v, error, editable, onChange }: { req: KycRequirementDto; v?: V; error?: string; editable: boolean; onChange: (v: Partial<V>) => void }) {
  const [uploading, setUploading] = useState(false);
  const label = `${req.label}${req.level > 1 ? ' (verificación ampliada)' : req.required ? '' : ' (opcional)'}`;
  const value = v?.value ?? '';

  if (req.type === 'BOOLEAN')
    return (
      <Row>
        <Switch value={value === 'true'} disabled={!editable} onValueChange={(b) => onChange({ value: String(b) })} trackColor={{ true: c.mint, false: c.line }} />
        <Body style={{ flex: 1 }}>{label}</Body>
      </Row>
    );

  if (req.type === 'SELECT' || req.type === 'COUNTRY') {
    const opts = req.type === 'SELECT' ? req.options : COUNTRIES;
    return (
      <View style={{ gap: 6 }}>
        <Text style={s.label}>{label}</Text>
        <Row style={{ gap: 6 }}>
          {opts.map((o) => (
            <Pressable key={o} disabled={!editable} onPress={() => onChange({ value: o })} accessibilityRole="radio" accessibilityState={{ selected: value === o }}>
              <Badge label={req.type === 'COUNTRY' ? countryName(o) : o} tone={value === o ? 'ok' : 'none'} />
            </Pressable>
          ))}
        </Row>
        {error ? <Text style={[s.small, { color: c.coral }]}>{error}</Text> : null}
      </View>
    );
  }

  if (req.type === 'DOCUMENT') {
    async function pick() {
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      if ((a.size ?? 0) > 10 * 1024 * 1024) return Alert.alert('El fichero supera 10 MB');
      setUploading(true);
      try {
        const contentType = a.mimeType ?? 'image/jpeg';
        const ticket = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/files/upload-url', {
          purpose: 'KYC_DOCUMENT',
          contentType,
          size: a.size,
          fileName: a.name,
        });
        const blob = await (await fetch(a.uri)).blob();
        const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: blob });
        if (!put.ok) throw new Error('No se pudo subir el fichero');
        await api.post(`/files/${ticket.fileId}/complete`);
        onChange({ fileId: ticket.fileId, fileName: a.name });
      } catch (e) {
        Alert.alert('Error', errorMessage(e));
      } finally {
        setUploading(false);
      }
    }
    return (
      <Card>
        <Text style={s.label}>{label}</Text>
        {req.helpText ? <Muted style={{ fontSize: 13 }}>{req.helpText}</Muted> : null}
        <Row>
          <Button title={v?.fileId ? 'Cambiar documento' : 'Subir documento'} size="sm" onPress={pick} disabled={!editable || uploading} />
          {uploading ? <ActivityIndicator color={c.mint} /> : v?.fileName ? <Badge label={v.fileName} tone="ok" /> : null}
        </Row>
        {error ? <Text style={[s.small, { color: c.coral }]}>{error}</Text> : null}
      </Card>
    );
  }

  return (
    <Field
      label={label}
      value={value}
      editable={editable}
      onChangeText={(t) => onChange({ value: t })}
      error={error}
      hint={req.type === 'DATE' ? 'Formato AAAA-MM-DD' : (req.helpText ?? undefined)}
      keyboardType={req.type === 'NUMBER' ? 'numeric' : req.type === 'DATE' ? 'numbers-and-punctuation' : 'default'}
      autoCapitalize={req.type === 'TEXT' ? 'words' : 'none'}
    />
  );
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
