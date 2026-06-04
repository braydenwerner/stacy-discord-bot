import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
  type InstanceStateName,
} from "@aws-sdk/client-ec2";

export type MinecraftServerState = {
  instanceId: string;
  state: InstanceStateName | "unknown";
  publicIp: string | null;
  host: string | null;
  port: number;
  connectAddress: string | null;
};

function requireConfig(): { instanceId: string; region: string } {
  const instanceId = process.env.MINECRAFT_INSTANCE_ID;
  const region = process.env.AWS_REGION;
  if (!instanceId) throw new Error("MINECRAFT_INSTANCE_ID is not set.");
  if (!region) throw new Error("AWS_REGION is not set.");
  return { instanceId, region };
}

function ec2Client(region: string): EC2Client {
  return new EC2Client({ region });
}

export function isMinecraftConfigured(): boolean {
  return !!(process.env.MINECRAFT_INSTANCE_ID && process.env.AWS_REGION);
}

function connectHost(publicIp: string | null): string | null {
  return process.env.MINECRAFT_SERVER_HOST ?? publicIp;
}

export async function getMinecraftServerState(): Promise<MinecraftServerState> {
  const { instanceId, region } = requireConfig();
  const port = Number(process.env.MINECRAFT_PORT ?? "25565");

  const res = await ec2Client(region).send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
  );

  const instance = res.Reservations?.[0]?.Instances?.[0];
  const state = (instance?.State?.Name ?? "unknown") as InstanceStateName | "unknown";
  const publicIp = instance?.PublicIpAddress ?? null;
  const host = connectHost(publicIp);

  return {
    instanceId,
    state,
    publicIp,
    host,
    port,
    connectAddress: host ? `${host}:${port}` : null,
  };
}

export async function startMinecraftServer(): Promise<MinecraftServerState> {
  const { instanceId, region } = requireConfig();
  const before = await getMinecraftServerState();

  if (before.state === "running") {
    return before;
  }

  if (before.state === "pending") {
    return before;
  }

  await ec2Client(region).send(
    new StartInstancesCommand({ InstanceIds: [instanceId] }),
  );

  return getMinecraftServerState();
}

export async function stopMinecraftServer(): Promise<MinecraftServerState> {
  const { instanceId, region } = requireConfig();
  const before = await getMinecraftServerState();

  if (before.state === "stopped") {
    return before;
  }

  if (before.state === "stopping") {
    return before;
  }

  await ec2Client(region).send(
    new StopInstancesCommand({ InstanceIds: [instanceId] }),
  );

  return getMinecraftServerState();
}
