#!/bin/bash
# Install Paper MC (Fill v3 API) and configure systemd + idle monitoring.
set -euo pipefail

MINECRAFT_VERSION="${1:?minecraft version required}"
JVM_MAX="${2:?jvm max memory required}"
MC_PORT="${3:-25565}"
BACKUP_BUCKET="${4:-}"
AWS_REGION="${5:-us-east-1}"
IDLE_MINUTES="${6:-30}"
BACKUP_KEEP_COUNT="${7:-30}"

PAPER_UA="stacy-discord-bot/1.0 (https://github.com/braydenwerner/stacy-discord-bot)"
FILL_API="https://fill.papermc.io/v3/projects/paper"

SERVER_DIR="/opt/minecraft/server"
mkdir -p "${SERVER_DIR}" /opt/minecraft/scripts

# 26.x requires Java 25 per Mojang; older lines run on 21.
JAVA_PKG="java-21-amazon-corretto-headless"
if [[ "${MINECRAFT_VERSION}" =~ ^26\. ]]; then
  JAVA_PKG="java-25-amazon-corretto-headless"
fi

dnf install -y "${JAVA_PKG}" awscli jq tar gzip cronie unzip

install_mcrcon() {
  if command -v mcrcon >/dev/null 2>&1; then
    return 0
  fi
  local zip="/tmp/mcrcon.zip"
  curl -fsSL -o "${zip}" \
    "https://github.com/Tiiffi/mcrcon/releases/download/v0.7.2/mcrcon-0.7.2-linux-x86-64-static.zip"
  unzip -o -j "${zip}" '*/mcrcon' -d /usr/local/bin
  chmod +x /usr/local/bin/mcrcon
}

install_mcrcon

fetch_paper_jar() {
  local version="$1"
  local dest="$2"
  local builds_response jar_url build_id sha256

  builds_response="$(curl -fsSL -H "User-Agent: ${PAPER_UA}" \
    "${FILL_API}/versions/${version}/builds")"

  if echo "${builds_response}" | jq -e '.ok == false' >/dev/null 2>&1; then
    echo "Paper API error for ${version}: $(echo "${builds_response}" | jq -r '.message // "unknown"')" >&2
    exit 1
  fi

  jar_url="$(echo "${builds_response}" | jq -r '
    [.[] | select(.channel == "STABLE")]
    | sort_by(.id) | last
    | .downloads."server:default".url // empty
  ')"
  build_id="$(echo "${builds_response}" | jq -r '
    [.[] | select(.channel == "STABLE")]
    | sort_by(.id) | last | .id // empty
  ')"
  sha256="$(echo "${builds_response}" | jq -r '
    [.[] | select(.channel == "STABLE")]
    | sort_by(.id) | last
    | .downloads."server:default".checksums.sha256 // empty
  ')"

  if [[ -z "${jar_url}" ]]; then
    echo "No stable Paper build for Minecraft ${version}." >&2
    exit 1
  fi

  echo "Installing Paper ${version} (stable build #${build_id})"
  curl -fsSL -H "User-Agent: ${PAPER_UA}" -o "${dest}" "${jar_url}"

  if [[ -n "${sha256}" ]]; then
    echo "${sha256}  ${dest}" | sha256sum -c -
  fi
}

fetch_paper_jar "${MINECRAFT_VERSION}" "${SERVER_DIR}/server.jar"

echo "eula=true" > "${SERVER_DIR}/eula.txt"

cat > "${SERVER_DIR}/server.properties" <<EOF
server-port=${MC_PORT}
enable-rcon=true
rcon.port=25575
rcon.password=$(openssl rand -hex 12)
max-players=5
view-distance=28
simulation-distance=12
online-mode=true
white-list=true
enforce-whitelist=true
motd=PG MC
level-seed=6680158985856009126
difficulty=normal
spawn-protection=0
EOF

if [[ -f /opt/minecraft/server-icon.png ]]; then
  cp /opt/minecraft/server-icon.png "${SERVER_DIR}/server-icon.png"
fi

if [[ -f /opt/minecraft/whitelist.json ]]; then
  cp /opt/minecraft/whitelist.json "${SERVER_DIR}/whitelist.json"
fi

RCON_PASS="$(grep '^rcon.password=' "${SERVER_DIR}/server.properties" | cut -d= -f2)"
echo "${RCON_PASS}" > /opt/minecraft/rcon.password
chmod 600 /opt/minecraft/rcon.password

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

cat > /etc/sysconfig/minecraft-idle <<EOF
BACKUP_BUCKET=${BACKUP_BUCKET}
AWS_REGION=${AWS_REGION}
IDLE_SHUTDOWN_MINUTES=${IDLE_MINUTES}
BACKUP_KEEP_COUNT=${BACKUP_KEEP_COUNT}
MINECRAFT_DIR=${SERVER_DIR}
EOF

systemctl enable --now crond
