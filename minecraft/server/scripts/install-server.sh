#!/bin/bash
# Install Paper MC and configure systemd + idle monitoring.
set -euo pipefail

MINECRAFT_VERSION="${1:?minecraft version required}"
JVM_MAX="${2:?jvm max memory required}"
MC_PORT="${3:-25565}"
BACKUP_BUCKET="${4:-}"
AWS_REGION="${5:-us-east-1}"
IDLE_MINUTES="${6:-30}"

SERVER_DIR="/opt/minecraft/server"
mkdir -p "${SERVER_DIR}" /opt/minecraft/scripts

# Install dependencies
dnf install -y java-21-amazon-corretto-headless awscli jq tar gzip cronie

# mcrcon for RCON and idle checks
if ! command -v mcrcon >/dev/null 2>&1; then
  curl -fsSL -o /tmp/mcrcon.tar.gz \
    https://github.com/Tiiffi/mcrcon/releases/download/v0.7.2/mcrcon-0.7.2-linux-x64.tar.gz
  tar -xzf /tmp/mcrcon.tar.gz -C /usr/local/bin mcrcon
  chmod +x /usr/local/bin/mcrcon
fi

# Fetch latest Paper build for the requested Minecraft version
BUILD="$(curl -fsSL "https://api.papermc.io/v2/projects/paper/versions/${MINECRAFT_VERSION}/builds" \
  | jq -r '.builds[-1].build')"
JAR_URL="https://api.papermc.io/v2/projects/paper/versions/${MINECRAFT_VERSION}/builds/${BUILD}/downloads/paper-${MINECRAFT_VERSION}-${BUILD}.jar"

curl -fsSL -o "${SERVER_DIR}/server.jar" "${JAR_URL}"

# First-run eula + basic server.properties
echo "eula=true" > "${SERVER_DIR}/eula.txt"

cat > "${SERVER_DIR}/server.properties" <<EOF
server-port=${MC_PORT}
enable-rcon=true
rcon.port=25575
rcon.password=$(openssl rand -hex 12)
max-players=10
view-distance=10
simulation-distance=10
online-mode=true
motd=Stacy Minecraft Server
EOF

RCON_PASS="$(grep '^rcon.password=' "${SERVER_DIR}/server.properties" | cut -d= -f2)"
echo "${RCON_PASS}" > /opt/minecraft/rcon.password
chmod 600 /opt/minecraft/rcon.password

# Aikar's flags tuned for ~8 GB instance with 6G heap
cat > /opt/minecraft/jvm-flags.conf <<EOF
-Xms${JVM_MAX}
-Xmx${JVM_MAX}
-XX:+UseG1GC
-XX:+ParallelRefProcEnabled
-XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions
-XX:+DisableExplicitGC
-XX:+AlwaysPreTouch
-XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40
-XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20
-XX:G1HeapWastePercent=5
-XX:G1MixedGCCountTarget=4
-XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90
-XX:G1RSetUpdatingPauseTimePercent=5
-XX:SurvivorRatio=32
-XX:+PerfDisableSharedMem
-XX:MaxTenuringThreshold=1
-Dusing.aikars.flags=https://mcflags.emc.gs
-Daikars.new.flags=true
EOF

# Scripts are copied by user-data; ensure env for idle monitor
cat > /etc/sysconfig/minecraft-idle <<EOF
BACKUP_BUCKET=${BACKUP_BUCKET}
AWS_REGION=${AWS_REGION}
IDLE_SHUTDOWN_MINUTES=${IDLE_MINUTES}
MINECRAFT_DIR=${SERVER_DIR}
EOF

systemctl enable --now crond
