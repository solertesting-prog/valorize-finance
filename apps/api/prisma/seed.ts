/**
 * Datos iniciales: servicios, red de ubicaciones, requisitos KYC genéricos y cuentas de arranque.
 * Idempotente: se puede ejecutar varias veces.
 *
 *   SEED_ADMIN_EMAIL=admin@valorize.finance SEED_ADMIN_PASSWORD='...' pnpm db:seed
 *   SEED_DEMO=true añade un empleado y un cliente de demostración (solo entornos no productivos).
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const SERVICES = [
  {
    code: 'CAMBIO_PRESENCIAL',
    name: 'Cambio USDT / USDC',
    description: 'Compra o venta de USDT y USDC en ventanilla. Requiere aprobación previa.',
    durationMin: 20,
    bufferMin: 5,
    kind: 'CRYPTO_EXCHANGE' as const,
    requiresKyc: true,
    requiredKycLevel: 1,
    requiresApproval: true,
  },
  { code: 'ALTA_CLIENTE', name: 'Alta de cliente', description: 'Apertura y verificación presencial de cuenta.', durationMin: 30, bufferMin: 5, requiresKyc: false, requiredKycLevel: 1 },
  { code: 'ASESORAMIENTO', name: 'Asesoramiento', description: 'Reunión con un gestor.', durationMin: 45, bufferMin: 15, requiresKyc: true, requiredKycLevel: 1 },
  { code: 'GESTION_DOCUMENTAL', name: 'Gestión documental', description: 'Entrega o recogida de documentación.', durationMin: 15, bufferMin: 0, requiresKyc: false, requiredKycLevel: 1 },
];

const WEEKDAYS_9_14_16_19 = [1, 2, 3, 4, 5].flatMap((d) => [
  { weekday: d, opensAt: 9 * 60, closesAt: 14 * 60 },
  { weekday: d, opensAt: 16 * 60, closesAt: 19 * 60 },
]);

const LOCATIONS = [
  {
    slug: 'barcelona-centro',
    name: 'Barcelona Centro',
    address: 'Passeig de Gràcia 21',
    city: 'Barcelona',
    postalCode: '08007',
    latitude: 41.3906,
    longitude: 2.1676,
    defaultCapacity: 3,
    hours: [...WEEKDAYS_9_14_16_19, { weekday: 6, opensAt: 10 * 60, closesAt: 14 * 60 }],
  },
  {
    slug: 'barcelona-sants',
    name: 'Barcelona Sants',
    address: 'Carrer de Sants 120',
    city: 'Barcelona',
    postalCode: '08028',
    latitude: 41.3755,
    longitude: 2.1366,
    defaultCapacity: 2,
    hours: WEEKDAYS_9_14_16_19,
  },
  {
    slug: 'barcelona-diagonal',
    name: 'Barcelona Diagonal',
    address: 'Avinguda Diagonal 640',
    city: 'Barcelona',
    postalCode: '08017',
    latitude: 41.3935,
    longitude: 2.1335,
    defaultCapacity: 2,
    hours: [1, 2, 3, 4, 5].map((d) => ({ weekday: d, opensAt: 8 * 60 + 30, closesAt: 17 * 60 })),
  },
];

// Requisitos KYC genéricos: no asumen país ni tipo de documento concreto.
const KYC = [
  { key: 'full_legal_name', label: 'Nombre legal completo', type: 'TEXT', required: true, sortOrder: 10, level: 1 },
  { key: 'birth_date', label: 'Fecha de nacimiento', type: 'DATE', required: true, sortOrder: 20, level: 1 },
  { key: 'nationality', label: 'Nacionalidad', type: 'COUNTRY', required: true, sortOrder: 30, level: 1, helpText: 'Código ISO de 2 letras, p. ej. ES' },
  { key: 'id_document_type', label: 'Tipo de documento', type: 'SELECT', required: true, sortOrder: 40, level: 1, options: ['DNI', 'NIE', 'Pasaporte', 'Otro documento oficial'] },
  { key: 'id_document_number', label: 'Número de documento', type: 'TEXT', required: true, sortOrder: 50, level: 1 },
  { key: 'id_document_expiry', label: 'Caducidad del documento', type: 'DATE', required: true, sortOrder: 60, level: 1 },
  { key: 'id_document_front', label: 'Documento (anverso)', type: 'DOCUMENT', required: true, sortOrder: 70, level: 1, helpText: 'Foto o PDF legible, máx. 10 MB' },
  { key: 'id_document_back', label: 'Documento (reverso)', type: 'DOCUMENT', required: false, sortOrder: 80, level: 1 },
  { key: 'address_line', label: 'Dirección de residencia', type: 'TEXT', required: true, sortOrder: 90, level: 1 },
  { key: 'residence_country', label: 'País de residencia', type: 'COUNTRY', required: true, sortOrder: 100, level: 1 },
  { key: 'occupation', label: 'Profesión', type: 'TEXT', required: false, sortOrder: 110, level: 2 },
  { key: 'proof_of_address', label: 'Justificante de domicilio', type: 'DOCUMENT', required: false, sortOrder: 120, level: 2 },
] as const;

const pw = (p: string) => hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

async function main() {
  for (const s of SERVICES) {
    await prisma.service.upsert({ where: { code: s.code }, create: s, update: {} });
  }
  await prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const services = await prisma.service.findMany();

  for (const { hours, ...l } of LOCATIONS) {
    const loc = await prisma.location.upsert({ where: { slug: l.slug }, create: l, update: {} });
    if ((await prisma.openingHours.count({ where: { locationId: loc.id } })) === 0) {
      await prisma.openingHours.createMany({ data: hours.map((h) => ({ ...h, locationId: loc.id })) });
    }
    for (const s of services) {
      await prisma.locationService.upsert({
        where: { locationId_serviceId: { locationId: loc.id, serviceId: s.id } },
        create: { locationId: loc.id, serviceId: s.id, capacity: s.code === 'ASESORAMIENTO' ? 1 : null },
        update: {},
      });
    }
  }

  for (const r of KYC) {
    await prisma.kycRequirement.upsert({
      where: { key: r.key },
      create: { ...r, options: 'options' in r ? [...r.options] : [] },
      update: {},
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash: await pw(adminPassword),
        firstName: 'Admin',
        lastName: 'Valorize',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        kycProfile: { create: {} },
      },
      update: {},
    });
    console.log(`✔ Administrador: ${adminEmail}`);
  }

  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('SEED_DEMO no se permite en producción');
    const centro = await prisma.location.findUniqueOrThrow({ where: { slug: 'barcelona-centro' } });
    await prisma.user.upsert({
      where: { email: 'empleado@demo.valorize' },
      create: {
        email: 'empleado@demo.valorize',
        passwordHash: await pw('Empleado1234'),
        firstName: 'Laura',
        lastName: 'Martí',
        role: 'EMPLOYEE',
        emailVerifiedAt: new Date(),
        kycProfile: { create: {} },
        staffLocations: { create: [{ locationId: centro.id }] },
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { email: 'cliente@demo.valorize' },
      create: {
        email: 'cliente@demo.valorize',
        phone: '+34600000001',
        passwordHash: await pw('Cliente1234'),
        firstName: 'Jordi',
        lastName: 'Puig',
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        kycProfile: { create: { status: 'APPROVED', level: 1, reviewedAt: new Date() } },
      },
      update: {},
    });
    await seedDemoIdentity('cliente@demo.valorize');
    console.log('✔ Demo: empleado@demo.valorize / Empleado1234 · cliente@demo.valorize / Cliente1234');
  }

  console.log('✔ Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/** Mismo formato que CryptoService.encrypt (AES-256-GCM): los valores KYC se guardan cifrados. */
function encrypt(plain: string): string {
  const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY no válida');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${enc.toString('base64url')}`;
}

/**
 * Identidad verificada de ejemplo (nivel básico, sin fotos del documento) para probar el mostrador
 * y la verificación ampliada. Solo si el cliente de demo aún no tiene datos.
 */
async function seedDemoIdentity(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { kycProfile: { include: { values: true } } } });
  const profile = user?.kycProfile;
  if (!profile || profile.values.length) return;
  const expiry = `${new Date().getFullYear() + 4}-06-30`;
  const data: Record<string, string> = {
    full_legal_name: 'Jordi Puig Ferrer',
    birth_date: '1988-04-12',
    nationality: 'ES',
    id_document_type: 'DNI',
    id_document_number: '12345678Z',
    id_document_expiry: expiry,
    address_line: 'Carrer de Pelai 12, 08001 Barcelona',
    residence_country: 'ES',
  };
  const reqs = await prisma.kycRequirement.findMany({ where: { key: { in: Object.keys(data) } } });
  for (const r of reqs) {
    await prisma.kycFieldValue.create({ data: { profileId: profile.id, requirementId: r.id, valueEnc: encrypt(data[r.key]) } });
  }
  await prisma.kycProfile.update({
    where: { id: profile.id },
    data: { status: 'APPROVED', level: 1, submittedAt: new Date(), reviewedAt: new Date(), expiresAt: new Date(`${expiry}T23:59:59Z`) },
  });
}
