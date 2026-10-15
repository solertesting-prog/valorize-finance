# Valorize Finance

Plataforma de registro, reservas e identificación por QR para la atención presencial.
Monorepo con API, web (cliente + panel del empleado + backoffice) y app móvil iOS/Android.

```
apps/
  api/      NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis · BullMQ · S3
  web/      Next.js 15 (App Router) · React 19 · TanStack Query
  mobile/   Expo (React Native) · expo-router
packages/
  shared/   Esquemas zod, tipos de la API, enums, cliente HTTP y formateo de fechas
infra/      Docker Compose (desarrollo y producción), Caddy, backups, política S3
```

## Arquitectura

```
 App iOS/Android ──HTTPS──▶ api.valorize.finance ─┐
                                                  │   ┌────────────┐
 Navegador ──HTTPS──▶ app.valorize.finance (Next) ─┼──▶│  API Nest  │──▶ PostgreSQL (datos, auditoría)
     │                 /api/v1/* → API (mismo origen)  │  (N réplicas)│──▶ Redis (rate limit, colas, locks)
     │                                                └────────────┘──▶ S3 privado (documentos KYC)
     └──── subida directa con URL firmada ──────────────────────────────▶ S3
                                                         │
                                       Webhooks firmados ▶ sistemas externos
                                       Email (SMTP) · SMS (Twilio) · Push (Expo → APNs/FCM)
```

| Capa | Qué hace |
|---|---|
| **Clientes** | Registro, verificación de email y teléfono, ubicaciones en mapa, reserva, QR, reprogramación, cancelación, bandeja de notificaciones, perfil con estado KYC, seguridad (MFA, sesiones), exportación y baja (RGPD) |
| **Empleado** | Login por rol, agenda del día, escáner QR con cámara (o lector USB), búsqueda por referencia, check-in → en atención → finalizada, no presentado, reprogramar, incidencias |
| **Admin** | Analítica (ocupación, demanda por franja, no-show, espera), citas, clientes, revisión KYC con acceso auditado a documentos, ubicaciones (horarios, puestos, cierres), servicios, equipo y roles, requisitos KYC configurables, webhooks, auditoría |
| **Backend** | Auth JWT + refresh rotatorio con detección de reutilización, MFA TOTP + códigos de recuperación, booking engine sin sobreventa, QR firmado, tareas programadas, webhooks con reintentos |

### Decisiones clave

- **QR sin datos personales.** El QR contiene `vf1.<idCita>.<nonce>.<firma HMAC>`. Reprogramar o cancelar rota el nonce, así que un QR antiguo (por ejemplo, una captura) deja de valer.
- **Sin sobreventa.** Cada reserva toma un `pg_advisory_xact_lock` por ubicación y recalcula la capacidad dentro de la transacción. La capacidad se define como puestos simultáneos por oficina, con límite opcional por servicio, y se respetan duración y margen.
- **KYC genérico.** Los campos se definen en `kyc_requirements` desde el backoffice: texto, fecha, país, lista, documento, sí/no y niveles 1–3. Los valores se cifran con AES-256-GCM y los documentos van a S3 privado con SSE. La decisión puede ser manual o venir de un proveedor externo (`provider`, `providerRef`).
- **Auditoría inmutable.** La tabla `audit_logs` es append-only: un trigger impide UPDATE y DELETE. Se registran logins, escaneos (válidos e inválidos), cambios de estado, accesos del personal a datos KYC y documentos, y cambios de configuración.
- **Roles.** `CUSTOMER`, `EMPLOYEE` (sus oficinas), `MANAGER` (backoffice operativo) y `ADMIN` (todo). El rol se lee de BD en cada petición, así que un cambio de rol o una suspensión surten efecto al instante. El personal debe activar MFA.
- **Web y API en el mismo origen** (`/api/v1` → API mediante rewrites de Next). La cookie de sesión es `httpOnly; SameSite=Strict` y el access token vive solo en memoria. En móvil, el refresh token se guarda en Keychain/Keystore.

## Puesta en marcha (desarrollo)

**Windows sin Docker:** ejecuta `scripts\windows\valorize-arrancar.bat` (copiado en una carpeta cualquiera). Clona o actualiza el repo, descarga PostgreSQL, Redis, MinIO y Mailpit portátiles en `.local-services/` (`node infra/local-services.mjs`), prepara la base de datos y arranca API y web. Solo necesita Git y Node 22.

Con Docker (macOS, Linux o Windows con WSL 2): Node 22, pnpm 10 y Docker.

```bash
pnpm install                                        # genera pnpm-lock.yaml la primera vez
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres, Redis, MinIO, Mailpit

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm --filter @valorize/shared build
pnpm --filter @valorize/api exec prisma generate
pnpm --filter @valorize/api exec prisma migrate deploy
SEED_ADMIN_EMAIL=admin@valorize.local SEED_ADMIN_PASSWORD='CambiaEsto123' SEED_DEMO=true pnpm db:seed

pnpm dev                                            # API :4000 y web :3000
pnpm --filter @valorize/mobile dev                  # app móvil (Expo)
```

- Web: http://localhost:3000. Documentación de la API (Swagger): http://localhost:4000/docs
- Correos de desarrollo (códigos de verificación): http://localhost:8025. Los SMS salen por la consola de la API.
- Cuentas demo: `cliente@demo.valorize / Cliente1234` y `empleado@demo.valorize / Empleado1234`. El empleado verá un aviso para activar la verificación en dos pasos.
- En la app móvil, `EXPO_PUBLIC_API_URL` debe apuntar a la IP de tu ordenador en la red local (por ejemplo `http://192.168.1.20:4000/v1`).

## Producción

```bash
cp infra/.env.production.example infra/.env.production   # rellena secretos y dominios
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production up -d --build
```

- **Caddy** emite y renueva TLS automáticamente para `APP_DOMAIN` y `API_DOMAIN`.
- La API aplica las migraciones al arrancar (`prisma migrate deploy`) y corre en 2 réplicas. Las tareas programadas se coordinan con un lock en Redis.
- Copia de seguridad diaria de PostgreSQL, cifrada con GPG y subida a S3 (`infra/backup.sh`).
- **S3**: bucket privado con bloqueo de acceso público y la política de `infra/s3-bucket-policy.json`. Configura en el bucket una regla CORS que permita `PUT` y `GET` desde `APP_DOMAIN` (las subidas van directas del navegador o la app). En la web, define `S3_PUBLIC_ORIGIN` para la CSP.
- **App móvil**: `eas build --profile production` y `eas submit`. Rellena `EAS_PROJECT_ID` y, para Android, `GOOGLE_MAPS_ANDROID_KEY`.
- **CI** (`.github/workflows/ci.yml`): tipos, tests, comprobación de que las migraciones coinciden con el schema, build, e imágenes en GHCR.

Las mismas imágenes funcionan en ECS o Kubernetes con PostgreSQL y Redis gestionados. Solo hay que cambiar `DATABASE_URL` y `REDIS_URL`.

## API (resumen)

Prefijo `/v1`. Errores siempre con forma `{ statusCode, code, message, details, requestId }`.

| Área | Endpoints |
|---|---|
| Auth | `POST auth/register · login · login/mfa · refresh · logout`, `verify/send · verify/confirm`, `password/forgot · reset · change`, `mfa/setup · enable · disable`, `GET/DELETE auth/sessions` |
| Perfil | `GET/PATCH me`, `GET me/export`, `POST me/delete`, `GET/PUT me/kyc`, `files/upload-url · :id/complete · :id/url` |
| Reservas | `GET locations · services · availability · availability/days`, `POST/GET me/bookings`, `GET me/bookings/:id · /qr · /calendar.ics`, `POST me/bookings/:id/reschedule · /cancel` |
| Notificaciones | `GET me/notifications · unread-count`, `POST :id/read · read-all`, `POST/DELETE me/notifications/devices` |
| Empleado | `GET staff/locations · dashboard · bookings · bookings/:id · bookings/by-reference/:ref`, `POST staff/scan · bookings/:id/transition · reschedule`, `GET/POST/PATCH staff/incidents` |
| Admin | `admin/users`, `admin/bookings`, `admin/locations` (+ cierres), `admin/services`, `admin/kyc/requirements · queue · users/:id · review`, `admin/analytics`, `admin/audit`, `admin/webhooks` (+ prueba, entregas, reenvío, rotar secreto) |

### Webhooks

Eventos: `user.registered`, `kyc.status_changed`, `booking.created|confirmed|rescheduled|cancelled|checked_in|completed|no_show`, `incident.created`.
Cabeceras: `X-Valorize-Event`, `X-Valorize-Delivery` y `X-Valorize-Signature: t=<unix>,v1=<hex>`, donde `v1 = HMAC-SHA256(secreto, "<t>.<cuerpo>")`.
Hay hasta 8 reintentos con backoff exponencial. Los payloads no llevan datos personales, solo identificadores.

## Reglas de negocio configurables (`.env`)

| Variable | Por defecto | Efecto |
|---|---|---|
| `CANCEL_CUTOFF_MIN` | 60 | El cliente puede cancelar o reprogramar hasta N minutos antes |
| `MAX_RESCHEDULES` | 3 | Cambios máximos por cita (cliente) |
| `MAX_ACTIVE_BOOKINGS_PER_USER` | 3 | Citas futuras simultáneas por cliente |
| `NO_SHOW_GRACE_MIN` | 15 | Pasado este margen sin check-in, la cita queda como no presentada |
| `CHECKIN_EARLY_MIN` | 60 | Aviso al empleado si el cliente llega antes de este margen |
| `REMINDER_HOURS_BEFORE` | 24 | Recordatorio por push y email |

Por ubicación, desde el backoffice: puestos simultáneos, intervalo entre horas, antelación mínima, horizonte de reserva, horarios por tramos, cierres y servicios con límite propio.

## Cambio USDT / USDC y auditoría de wallets

- El servicio de tipo **Cambio cripto** (`kind = CRYPTO_EXCHANGE`) añade un paso al reservar: sentido (vender o comprar cripto), moneda (USDT/USDC), red (TRON, Ethereum, Polygon, BNB Chain), importe y wallet del cliente.
- Los servicios con `requiresApproval` crean la cita en **Pendiente de aprobación**. El QR solo se emite al aprobarla desde **Backoffice → Solicitudes**. Si se rechaza, el cliente recibe el motivo.
- Cada wallet se audita al enviarse y se reutiliza el resultado durante 24 h:
  - formato y checksum de la dirección;
  - lista de sanciones OFAC (sincronizada cada noche) y lista interna de Valorize;
  - congelación por el emisor (Tether `isBlackListed`, Circle `isBlacklisted`);
  - saldo en la red;
  - antigüedad de la wallet;
  - wallet compartida entre clientes;
  - opcionalmente, la API de sanciones de Chainalysis.
- Resultado: **Sin riesgo**, **Revisar** o **Bloqueada**. Al cliente nunca se le muestra "Bloqueada"; solo se le dice que no podemos operar con esa wallet.
- Una wallet en *Revisar* se puede aprobar como excepción, y queda registrada en la auditoría.
- Límites (mínimo/máximo por operación, diario, mensual, umbral de KYC ampliado y antigüedad mínima) se configuran en **Backoffice → Cambio cripto**.
- Variables opcionales en `.env`: `ETHERSCAN_API_KEY` (antigüedad en redes EVM), `TRONGRID_API_KEY`, `CHAINALYSIS_SANCTIONS_API_KEY`, `RPC_*_URL`, y `SCREENING_OFFLINE=true` para desarrollo sin red.
- El proveedor de screening es intercambiable (`ScreeningProvider`) para conectar más adelante Chainalysis KYT, Elliptic o TRM.

### OpenScan y verificación de transacciones

- **Backoffice → Operaciones** lista todas las peticiones con wallet, vengan de la web o de la app (columna *Canal*), con filtros por estado de la wallet, de la transacción, red y canal. **Revisar** despliega la solicitud, la verificación de la transacción y la actividad de la wallet en OpenScan.
- [OpenScan](https://github.com/openscan-explorer/explorer) se muestra integrado en Solicitudes, Operaciones, la ficha de cada wallet y cada cita, con enlace para abrirlo en una pestaña. Cubre Ethereum, Polygon y BNB Chain; para TRON se enlaza Tronscan, porque OpenScan no lo soporta.
- Al guardar el **hash de la transacción** en la liquidación, la API lo comprueba en la blockchain:
  - que existe y se ejecutó con éxito;
  - que transfiere el USDT/USDC oficial de esa red;
  - que sale de la wallet del cliente (venta) o llega a ella (compra);
  - que la contraparte es una dirección de Valorize;
  - que el importe coincide;
  - que tiene suficientes confirmaciones.
- Resultados: *Verificada*, *Verificada con avisos*, *Pendiente de confirmaciones*, *No coincide*, *No encontrada*, *Fallida en la red* y *No se pudo comprobar*.
- Las pendientes se vuelven a comprobar cada 10 minutos. Un mismo hash no se puede usar en dos operaciones.
- Las direcciones propias de Valorize por red se configuran en **Backoffice → Cambio cripto**.
- Variables: `OPENSCAN_URL` en la API (instancia de OpenScan; por defecto la pública) y `OPENSCAN_ORIGIN` en la web (orígenes permitidos para mostrarlo integrado).

### Probar el flujo de cambio

1. Inicia sesión como `cliente@demo.valorize` / `Cliente1234`, reserva **Cambio USDT / USDC** e indica un importe y una dirección de wallet. La cita debe quedar en "Pendiente de aprobación", todavía sin QR.
2. Inicia sesión como `admin@valorize.local` / `Admin123456` y entra en **Solicitudes**. La solicitud debe aparecer ahí con el resultado de la auditoría de la wallet. Apruébala.
3. Vuelve a la cuenta del cliente: el QR ya debe aparecer en la cita.

## Estado de verificación

Durante la construcción no hubo acceso al registro npm, así que no se pudieron instalar dependencias ni ejecutar `next build` o `nest build`. Lo que sí se verificó:

- Las migraciones SQL se aplicaron sobre PostgreSQL 16 real, junto con consultas de analítica, contador de referencias, advisory locks, `citext` y el trigger de auditoría.
- Lógica de dominio ejecutada: cálculo de solapes del booking engine, firma y verificación del QR, cifrado AES-GCM y hash de contraseñas.
- Comprobación de tipos con TypeScript: `packages/shared` completo; API, web y móvil contra tipos simulados de las librerías externas. Los errores de tipos que aparecieron ya están corregidos.

Al instalar por primera vez, ejecuta `pnpm -r typecheck` y `pnpm --filter @valorize/web build`, y corrige lo que aparezca. El pipeline de CI lo hace en cada push.

## Pendiente de decisión de negocio

- Textos legales definitivos (`apps/web/src/app/legal`) y DPD.
- Proveedor KYC externo, si se quiere automatizar la verificación. El modelo ya soporta `provider` y `providerRef`.
- Proveedores de email (SMTP) y SMS (Twilio u otro).
- Icono y splash definitivos de la app (`apps/mobile/assets`). Los actuales son provisionales.
- Normativa aplicable según país, operación y modelo de negocio (prevención de blanqueo, conservación de documentos).
