#!/bin/bash
# Despliegue / actualización de Valorize en el servidor. Se ejecuta como root (por SSM Run Command).
#   VF_REGION=eu-south-2 VF_BUCKET=... VF_BACKUP_BUCKET=... VF_DOMAIN=1-2-3-4.sslip.io VF_ADMIN_EMAIL=... bash infra/aws/deploy.sh
# - La primera vez genera infra/.env.production con secretos aleatorios (se guardan también en SSM Parameter Store).
# - Siempre: descarga el código, reconstruye, arranca y aplica migraciones; el seed es idempotente.
set -euo pipefail
: "${VF_REGION:?}" "${VF_BUCKET:?}" "${VF_BACKUP_BUCKET:?}" "${VF_DOMAIN:?}" "${VF_ADMIN_EMAIL:?}"
PREFIX="${VF_PARAM_PREFIX:-/valorize/prod}"
REPO=/opt/valorize
ENVF=$REPO/infra/.env.production
COMPOSE="docker compose -f $REPO/infra/docker-compose.prod.yml --env-file $ENVF"
AWS="aws --region $VF_REGION"

test -f /var/lib/valorize-bootstrap-done || { echo "El servidor aún se está preparando (user-data). Reintenta en unos minutos."; exit 3; }
cd $REPO
git fetch -q origin && git reset -q --hard origin/main
echo "Código: $(git log --oneline -1)"

rand() { openssl rand -base64 "$1" | tr -d '\n/+=' | cut -c1-"$2"; }

if [ ! -f "$ENVF" ]; then
  echo "Generando configuración y secretos..."
  ADMIN_PASSWORD="Vf-$(rand 24 20)-9a"
  umask 077
  cat > "$ENVF" <<CONF
APP_DOMAIN=$VF_DOMAIN
API_DOMAIN=api.$VF_DOMAIN
APP_URL=https://$VF_DOMAIN
API_PUBLIC_URL=https://api.$VF_DOMAIN
CORS_ORIGINS=https://$VF_DOMAIN
POSTGRES_USER=valorize
POSTGRES_PASSWORD=$(rand 48 40)
POSTGRES_DB=valorize
REDIS_PASSWORD=$(rand 48 40)
JWT_ACCESS_SECRET=$(rand 64 64)
QR_SIGNING_SECRET=$(rand 64 64)
FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32)
S3_REGION=$VF_REGION
S3_BUCKET=$VF_BUCKET
AWS_REGION=$VF_REGION
BACKUP_BUCKET=$VF_BACKUP_BUCKET
BACKUP_PASSPHRASE=$(rand 48 40)
MAIL_FROM=Valorize Finance <no-reply@$VF_DOMAIN>
API_REPLICAS=1
PG_SHARED_BUFFERS=256MB
CONF
  chmod 600 "$ENVF"
  # Copia de los secretos fuera del servidor (sin ella, perder el disco = perder el acceso a los datos cifrados).
  $AWS ssm put-parameter --name "$PREFIX/env" --type SecureString --value "file://$ENVF" --overwrite >/dev/null
  $AWS ssm put-parameter --name "$PREFIX/admin-password" --type SecureString --value "$ADMIN_PASSWORD" --overwrite >/dev/null
  echo "Secretos guardados en SSM Parameter Store ($PREFIX)."
fi

echo "Construyendo y arrancando (la primera vez tarda 10-15 minutos)..."
export DOCKER_BUILDKIT=1
$COMPOSE build --pull
$COMPOSE up -d --remove-orphans

echo "Esperando a la API..."
for i in $(seq 1 60); do
  if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then echo "API lista"; break; fi
  sleep 5
  [ "$i" = 60 ] && { $COMPOSE logs --tail 80 api; echo "La API no arranca"; exit 1; }
done

echo "Datos iniciales (ubicaciones, servicios, requisitos KYC y administrador)..."
# Leer valores sin "source" (algunas líneas, como MAIL_FROM, no son sintaxis de shell).
getv() { grep -m1 "^$1=" "$ENVF" | cut -d= -f2-; }
POSTGRES_USER=$(getv POSTGRES_USER); POSTGRES_PASSWORD=$(getv POSTGRES_PASSWORD); POSTGRES_DB=$(getv POSTGRES_DB)
docker build -q --target build -f apps/api/Dockerfile -t valorize/api-build . >/dev/null
ADMIN_PASSWORD=$($AWS ssm get-parameter --name "$PREFIX/admin-password" --with-decryption --query Parameter.Value --output text)
docker run --rm --network valorize_default --env-file "$ENVF" \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB?schema=public" \
  -e SEED_ADMIN_EMAIL="$VF_ADMIN_EMAIL" -e SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -w /repo/apps/api valorize/api-build npx tsx prisma/seed.ts | grep -v -i password

docker image prune -f >/dev/null
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
echo "Desplegado: https://$VF_DOMAIN  ·  API: https://api.$VF_DOMAIN"
