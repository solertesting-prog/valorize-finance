#!/bin/sh
# Volcado lógico de PostgreSQL, cifrado con GPG simétrico y subido a S3.
set -eu
TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE=/tmp/valorize-$TS.sql.gz.gpg
pg_dump --format=plain --no-owner | gzip -9 | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$FILE"
aws s3 cp "$FILE" "s3://$BACKUP_BUCKET/postgres/valorize-$TS.sql.gz.gpg" --sse AES256
rm -f "$FILE"
echo "Backup $TS subido"
