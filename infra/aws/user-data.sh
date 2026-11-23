#!/bin/bash
# Primer arranque del servidor (EC2, Ubuntu 24.04): memoria de intercambio, Docker y el código.
# El despliegue en sí lo hace infra/aws/deploy.sh (se lanza por SSM, sin SSH).
set -euxo pipefail
exec > >(tee -a /var/log/valorize-bootstrap.log) 2>&1

# 4 GB de swap: la compilación de la web necesita memoria puntualmente.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git jq docker.io docker-compose-v2 docker-buildx unattended-upgrades
systemctl enable --now docker
snap install aws-cli --classic || true
# Actualizaciones de seguridad automáticas del sistema.
dpkg-reconfigure -f noninteractive unattended-upgrades || true

if [ ! -d /opt/valorize/.git ]; then
  git clone https://github.com/solertesting-prog/valorize-finance.git /opt/valorize
fi
touch /var/lib/valorize-bootstrap-done
