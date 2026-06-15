/**
 * Fetch CloudFormation stack outputs and write minecraft/bot.env.
 * Requires AWS credentials (env vars, ~/.aws/credentials, or AWS_PROFILE).
 *
 * Usage: pnpm run minecraft:fetch-env
 *        STACK_NAME=stacy-mc AWS_REGION=us-west-1 pnpm run minecraft:fetch-env
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MC_ROOT = path.resolve(__dirname, "..");
const BOT_ENV = path.join(MC_ROOT, "bot.env");
const INSTANCE_ENV = path.join(MC_ROOT, "instance.env");

const STACK_NAME = process.env.STACK_NAME ?? "stacy-mc";
const REGION =
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION ??
  readInstanceEnv("AWS_REGION") ??
  "us-west-1";

function readInstanceEnv(key: string): string | undefined {
  if (!fs.existsSync(INSTANCE_ENV)) return undefined;
  for (const line of fs.readFileSync(INSTANCE_ENV, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() === key) {
      return trimmed.slice(eq + 1).trim();
    }
  }
  return undefined;
}

function outputValue(
  outputs: { OutputKey?: string; OutputValue?: string }[] | undefined,
  key: string,
): string {
  const value = outputs?.find((o) => o.OutputKey === key)?.OutputValue;
  if (!value) {
    throw new Error(`Stack output ${key} not found on ${STACK_NAME}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const client = new CloudFormationClient({ region: REGION });
  const res = await client.send(
    new DescribeStacksCommand({ StackName: STACK_NAME }),
  );
  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${STACK_NAME} not found in ${REGION}.`);
  }

  const outputs = stack.Outputs;
  const backupBucket = outputValue(outputs, "BackupBucket");
  const accessKeyId = outputValue(outputs, "BotAccessKeyId");
  const secretKey = outputValue(outputs, "BotSecretAccessKey");
  const budgetName =
    outputs?.find((o) => o.OutputKey === "BudgetName")?.OutputValue ??
    "stacy-mc-credits";

  const { STSClient, GetCallerIdentityCommand } = await import(
    "@aws-sdk/client-sts"
  );
  const accountId = await new STSClient({ region: REGION }).send(
    new GetCallerIdentityCommand({}),
  ).then((r) => r.Account ?? "");

  const instanceId = outputValue(outputs, "InstanceId");
  const mcHost =
    readInstanceEnv("MC_HOST") ?? outputValue(outputs, "McHost");
  const mcPort =
    readInstanceEnv("MC_PORT") ?? outputValue(outputs, "McPort") ?? "25565";

  const lines = [
    `# Generated from CloudFormation stack ${STACK_NAME} in ${REGION}`,
    `AWS_REGION=${REGION}`,
    `AWS_ACCESS_KEY_ID=${accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${secretKey}`,
    `MINECRAFT_INSTANCE_ID=${instanceId}`,
    `MINECRAFT_SERVER_HOST=${mcHost}`,
    `MINECRAFT_PORT=${mcPort}`,
    `MINECRAFT_BACKUP_BUCKET=${backupBucket}`,
    `AWS_BUDGET_NAME=${budgetName}`,
    `AWS_PROMO_CREDIT_USD=1000`,
    `AWS_ACCOUNT_ID=${accountId}`,
    "",
  ];

  fs.writeFileSync(BOT_ENV, lines.join("\n"), { mode: 0o600 });
  console.log(`Wrote ${BOT_ENV}`);
  console.log("Run: pnpm run minecraft:sync-env");
  console.log("Then restart Stacy in the shared tmux pane.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
