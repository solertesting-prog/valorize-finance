import Link from 'next/link';
import { notFound } from 'next/navigation';

const DOCS: Record<string, { title: string; body: string[] }> = {
  condiciones: {
    title: 'Condiciones de uso',
    body: [
      'Este documento regula el uso de la plataforma de reservas de Valorize Finance.',
      'El texto definitivo lo facilita el equipo jurídico de Valorize antes del lanzamiento.',
    ],
  },
  privacidad: {
    title: 'Política de privacidad',
    body: [
      'Valorize Finance trata tus datos para gestionar tus citas, verificar tu identidad cuando una gestión lo requiere y avisarte de cambios.',
      'Puedes descargar tus datos o eliminar tu cuenta en cualquier momento desde Perfil, Seguridad y privacidad.',
      'El texto definitivo, con responsable, base jurídica, plazos de conservación y datos de contacto del DPD, lo facilita el equipo jurídico de Valorize antes del lanzamiento.',
    ],
  },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <div className="page narrow">
      <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'var(--paper)' }}>
        <b style={{ color: 'var(--mint)' }}>VALORIZE</b> FINANCE
      </Link>
      <h1 style={{ marginTop: 32 }}>{d.title}</h1>
      {d.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
