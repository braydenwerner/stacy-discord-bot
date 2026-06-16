import fs from "node:fs";
import path from "node:path";

const MINECRAFT_DIR = path.join(process.cwd(), "minecraft");

const INSTANCE_ENV_MAP: Record<string, string> = {
  INSTANCE_ID: "MINECRAFT_INSTANCE_ID",
  MC_HOST: "MINECRAFT_SERVER_HOST",
  MC_PORT: "MINECRAFT_PORT",
  AWS_REGION: "AWS_REGION",
};

const BOT_ENV_KEYS = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "MINECRAFT_INSTANCE_ID",
  "MINECRAFT_SERVER_HOST",
  "MINECRAFT_PORT",
  "MINECRAFT_BACKUP_BUCKET",
  "MINECRAFT_SSH_KEY_PATH",
  "MINECRAFT_NOTIFY_CHANNEL_ID",
  "MINECRAFT_IDLE_SHUTDOWN_MINUTES",
  "AWS_BUDGET_NAME",
  "AWS_MONTHLY_BUDGET_USD",
  "AWS_PROMO_CREDIT_USD",
  "AWS_ACCOUNT_ID",
] as const;

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function setIfUnset(key: string, value: string | undefined): void {
  if (value && !process.env[key]) {
    process.env[key] = value;
  }
}

function applyVars(vars: Record<string, string>, keys: readonly string[]): void {
  for (const key of keys) {
    setIfUnset(key, vars[key]);
  }
}

function applyInstanceEnv(vars: Record<string, string>): void {
  for (const [src, dest] of Object.entries(INSTANCE_ENV_MAP)) {
    setIfUnset(dest, vars[src] ?? vars[dest]);
  }
}

/** Load minecraft/instance.env and minecraft/bot.env into process.env (without overriding .env). */
export function loadMinecraftEnv(): void {
  const instancePath = path.join(MINECRAFT_DIR, "instance.env");
  if (fs.existsSync(instancePath)) {
    applyInstanceEnv(parseEnvFile(fs.readFileSync(instancePath, "utf8")));
  }

  const botPath = path.join(MINECRAFT_DIR, "bot.env");
  if (fs.existsSync(botPath)) {
    applyVars(parseEnvFile(fs.readFileSync(botPath, "utf8")), BOT_ENV_KEYS);
  }
}

export function getMinecraftConfigError(): string | null {
  if (!process.env.MINECRAFT_INSTANCE_ID || !process.env.AWS_REGION) {
    return (
      "Minecraft server control is not configured. Copy `minecraft/instance.env.example` to " +
      "`minecraft/instance.env` and add AWS keys to `minecraft/bot.env` " +
      "(see `minecraft/bot.env.example`, or run `pnpm run minecraft:fetch-env` after deploy)."
    );
  }

  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return (
      "Minecraft AWS credentials are missing. Add `AWS_ACCESS_KEY_ID` and " +
      "`AWS_SECRET_ACCESS_KEY` from CloudFormation outputs `BotAccessKeyId` / " +
      "`BotSecretAccessKey` to `minecraft/bot.env`, then run `pnpm run minecraft:sync-env`."
    );
  }

  return null;
}

export function isMinecraftConfigured(): boolean {
  return getMinecraftConfigError() === null;
}

/** Must match IdleShutdownMinutes on the EC2 host (default 30). */
export function minecraftIdleShutdownMinutes(): number {
  const raw = process.env.MINECRAFT_IDLE_SHUTDOWN_MINUTES?.trim();
  if (!raw) return 30;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function logMinecraftConfigStatus(): void {
  const error = getMinecraftConfigError();
  if (error) {
    console.warn(`[minecraft] ${error}`);
    return;
  }

  console.log(
    `[minecraft] configured instance=${process.env.MINECRAFT_INSTANCE_ID} ` +
      `region=${process.env.AWS_REGION} host=${process.env.MINECRAFT_SERVER_HOST ?? "(instance IP)"}`,
  );
}
