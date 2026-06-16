import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { spawn } from "node:child_process";
import { getMinecraftServerState } from "@/utils/minecraft/minecraftClient";

const SSM_POLL_MS = 2000;
const SSM_TIMEOUT_MS = 45_000;

function isSsmInvocationPending(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name) : "";
  return name === "InvocationDoesNotExist";
}

function ssmClient(region: string): SSMClient {
  return new SSMClient({ region });
}

function sshKeyPath(): string | null {
  return process.env.MINECRAFT_SSH_KEY_PATH ?? null;
}

async function runViaSsh(shell: string): Promise<string> {
  const keyPath = sshKeyPath();
  if (!keyPath) {
    throw new Error(
      "Remote logs require SSM or MINECRAFT_SSH_KEY_PATH on the bot host.",
    );
  }

  const state = await getMinecraftServerState();
  if (state.state !== "running") {
    throw new Error(`Instance is ${state.state}; start the server first.`);
  }

  const host = state.host ?? state.publicIp;
  if (!host) {
    throw new Error("No connect host or public IP for SSH.");
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `ec2-user@${host}`,
        "bash",
        "-s",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("SSH command timed out."));
    }, SSM_TIMEOUT_MS);

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(`${stdout}${stderr ? `\n${stderr}` : ""}`.trim());
        return;
      }
      reject(new Error(stderr.trim() || `SSH exited with code ${code}`));
    });

    proc.stdin.write(shell);
    proc.stdin.end();
  });
}

async function runViaSsm(instanceId: string, region: string, shell: string): Promise<string> {
  const client = ssmClient(region);
  const send = await client.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [shell] },
      TimeoutSeconds: 60,
    }),
  );

  const commandId = send.Command?.CommandId;
  if (!commandId) {
    throw new Error("SSM SendCommand did not return a command ID.");
  }

  const deadline = Date.now() + SSM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let inv;
    try {
      inv = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );
    } catch (error) {
      if (isSsmInvocationPending(error)) {
        await new Promise((resolve) => setTimeout(resolve, SSM_POLL_MS));
        continue;
      }
      throw error;
    }

    const status = inv.Status;
    if (status === "Success") {
      const out = [inv.StandardOutputContent, inv.StandardErrorContent]
        .filter(Boolean)
        .join("\n")
        .trim();
      return out || "(no output)";
    }

    if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
      throw new Error(
        inv.StatusDetails ??
          inv.StandardErrorContent ??
          `SSM command ${status?.toLowerCase()}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, SSM_POLL_MS));
  }

  throw new Error("SSM command timed out waiting for output.");
}

/** Run a shell script on the EC2 host via SSM, falling back to SSH when configured. */
export async function runOnMinecraftHost(shell: string): Promise<string> {
  const region = process.env.AWS_REGION;
  const instanceId = process.env.MINECRAFT_INSTANCE_ID;
  if (!region || !instanceId) {
    throw new Error("MINECRAFT_INSTANCE_ID and AWS_REGION must be set.");
  }

  const state = await getMinecraftServerState();
  if (state.state !== "running") {
    throw new Error(`Instance is ${state.state}; start the server first.`);
  }

  try {
    return await runViaSsm(instanceId, region, shell);
  } catch (ssmError) {
    if (!sshKeyPath()) {
      const reason =
        ssmError instanceof Error ? ssmError.message : String(ssmError);
      throw new Error(
        `SSM failed (${reason}). If this persists, run \`pnpm run minecraft:update-bot-iam\` with admin AWS credentials, ensure the EC2 role includes AmazonSSMManagedInstanceCore, or set MINECRAFT_SSH_KEY_PATH.`,
      );
    }
    return runViaSsh(shell);
  }
}
