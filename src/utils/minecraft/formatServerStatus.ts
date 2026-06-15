import type { MinecraftServerState } from "@/utils/minecraft/minecraftClient";

const STATE_LABEL: Record<string, string> = {
  pending: "Starting up…",
  running: "Online",
  stopping: "Shutting down…",
  stopped: "Offline",
  shutting_down: "Shutting down…",
  terminated: "Terminated",
};

export function formatMinecraftStatus(state: MinecraftServerState): string {
  const label = STATE_LABEL[state.state] ?? state.state;
  const lines = [`**Minecraft server:** ${label}`];

  if (state.connectAddress) {
    lines.push(`Connect: \`${state.connectAddress}\``);
  }

  if (state.state === "stopped") {
    lines.push("Use `/minecraft start` to wake the server (takes ~1 minute).");
  } else if (state.state === "pending") {
    lines.push("The instance is booting — Minecraft should be ready in about a minute.");
  }

  return lines.join("\n");
}

export function formatMinecraftStartResult(
  before: MinecraftServerState,
  after: MinecraftServerState,
): string {
  if (before.state === "running") {
    return formatMinecraftStatus(after) + "\n\nAlready running.";
  }
  if (after.state === "pending" || after.state === "running") {
    return (
      formatMinecraftStatus(after) +
      "\n\nBooting the EC2 instance. Give it a minute, then connect."
    );
  }
  return formatMinecraftStatus(after);
}

export function formatMinecraftStopResult(
  before: MinecraftServerState,
  after: MinecraftServerState,
): string {
  if (before.state === "stopped") {
    return formatMinecraftStatus(after) + "\n\nAlready stopped.";
  }
  if (after.state === "stopping" || after.state === "stopped") {
    return (
      formatMinecraftStatus(after) +
      "\n\nStopping the instance. Compute billing stops once it reaches **Offline**."
    );
  }
  return formatMinecraftStatus(after);
}
