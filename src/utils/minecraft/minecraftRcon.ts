import { runOnMinecraftHost } from "@/utils/minecraft/minecraftRemote";

const MAX_COMMAND_LEN = 256;

export function validateMinecraftConsoleCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command cannot be empty.");
  }
  if (trimmed.length > MAX_COMMAND_LEN) {
    throw new Error(`Command too long (max ${MAX_COMMAND_LEN} characters).`);
  }
  if (/[\r\n\x00]/.test(trimmed)) {
    throw new Error("Command cannot contain newlines.");
  }
  return trimmed;
}

function bashSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Run a Paper/Spigot console command on the live server via RCON (requires EC2 running). */
export async function runMinecraftConsoleCommand(command: string): Promise<string> {
  const cmd = validateMinecraftConsoleCommand(command);
  const quoted = bashSingleQuote(cmd);

  const out = await runOnMinecraftHost(`set -euo pipefail
RCON_PASSWORD_FILE="/opt/minecraft/rcon.password"
if [[ ! -f "$RCON_PASSWORD_FILE" ]]; then
  echo "RCON is not configured on this server." >&2
  exit 1
fi
if ! systemctl is-active --quiet minecraft; then
  echo "minecraft.service is not running." >&2
  exit 1
fi
if ! command -v mcrcon >/dev/null 2>&1; then
  echo "mcrcon is not installed." >&2
  exit 1
fi
RCON_PASS="$(cat "$RCON_PASSWORD_FILE")"
mcrcon -H 127.0.0.1 -P 25575 -p "$RCON_PASS" ${quoted}
`);

  const trimmed = out.trim();
  return trimmed || "(command accepted, no output)";
}
