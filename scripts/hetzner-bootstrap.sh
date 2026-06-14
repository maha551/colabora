#!/usr/bin/env bash
# Prepare a Hetzner Ubuntu/Debian server for Kamal deploys.
# Run as root on each app server (not on the data/Postgres server):
#   scp scripts/hetzner-bootstrap.sh root@SERVER:
#   ssh root@SERVER "bash hetzner-bootstrap.sh"
#
# After this script:
#   Copy your SSH public key to /home/deploy/.ssh/authorized_keys

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"

echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

echo "==> Installing common tools..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates ufw

echo "==> Configuring UFW (SSH + HTTP/S)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable || true

if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "==> Creating user: $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  echo "    Add your SSH public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
else
  usermod -aG docker "$DEPLOY_USER" || true
  echo "==> User $DEPLOY_USER already exists (added to docker group)"
fi

echo ""
echo "Bootstrap complete."
echo "   Next: add SSH key for $DEPLOY_USER, then from your laptop:"
echo "   kamal setup -d pilot && kamal deploy -d pilot"
