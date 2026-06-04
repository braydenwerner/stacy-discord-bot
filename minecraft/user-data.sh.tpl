#!/bin/bash
# Amazon Linux 2023 first-boot: install Paper, systemd service, idle auto-shutdown.
set -euo pipefail
exec > /var/log/minecraft-user-data.log 2>&1

BACKUP_BUCKET="__BACKUP_BUCKET__"
AWS_REGION="__AWS_REGION__"
MINECRAFT_VERSION="__MINECRAFT_VERSION__"
JVM_MAX="__JVM_MAX_MEMORY__"
MC_PORT="__MINECRAFT_PORT__"
IDLE_MINUTES="__IDLE_SHUTDOWN_MINUTES__"

install -d -m 755 /opt/minecraft/scripts
cat > /opt/minecraft/scripts/backup-world.sh <<'BACKUP_EOF'
__BACKUP_SCRIPT__
BACKUP_EOF
cat > /opt/minecraft/scripts/periodic-backup.sh <<'PERIODIC_EOF'
__PERIODIC_BACKUP_SCRIPT__
PERIODIC_EOF
cat > /opt/minecraft/scripts/idle-shutdown.sh <<'IDLE_EOF'
__IDLE_SCRIPT__
IDLE_EOF
cat > /opt/minecraft/scripts/stop-server.sh <<'STOP_EOF'
__STOP_SCRIPT__
STOP_EOF
cat > /opt/minecraft/scripts/post-stop-backup.sh <<'POST_EOF'
__POST_STOP_SCRIPT__
POST_EOF
cat > /opt/minecraft/scripts/install-server.sh <<'INSTALL_EOF'
__INSTALL_SCRIPT__
INSTALL_EOF
chmod +x /opt/minecraft/scripts/*.sh

id -u minecraft &>/dev/null || useradd -r -m -d /opt/minecraft -s /sbin/nologin minecraft

/opt/minecraft/scripts/install-server.sh \
  "${MINECRAFT_VERSION}" "${JVM_MAX}" "${MC_PORT}" "${BACKUP_BUCKET}" "${AWS_REGION}" "${IDLE_MINUTES}"

chown -R minecraft:minecraft /opt/minecraft

cat > /etc/systemd/system/minecraft.service <<'UNIT_EOF'
__SYSTEMD_UNIT__
UNIT_EOF

systemctl daemon-reload
systemctl enable --now minecraft.service

cat > /etc/cron.d/minecraft-idle <<CRON_EOF
*/5 * * * * root . /etc/sysconfig/minecraft-idle; /opt/minecraft/scripts/idle-shutdown.sh >> /var/log/minecraft-idle.log 2>&1
CRON_EOF

cat > /etc/cron.d/minecraft-backup <<CRON_EOF
0 */__BACKUP_INTERVAL_HOURS__ * * * root . /etc/sysconfig/minecraft-idle; /opt/minecraft/scripts/periodic-backup.sh >> /var/log/minecraft-backup.log 2>&1
CRON_EOF

echo "Minecraft user-data finished."
