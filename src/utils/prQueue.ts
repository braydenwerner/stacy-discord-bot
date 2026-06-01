import { emojis, MS_IN_ONE_MINUTE, MS_IN_ONE_SECOND } from "@/constants/constants";
import { getRunStatus, launchPrAgent } from "@/utils/cursorAgent";
import {
  ensureQueueCard,
  finalizeQueueCard,
  refreshQueueCard,
} from "@/utils/prQueueCard";
import { Message } from "discord.js";

const LOADING_REACTION = "\u23f3"; // hourglass
const POLL_INTERVAL_MS = 10 * MS_IN_ONE_SECOND;
const MAX_WAIT_MS = 30 * MS_IN_ONE_MINUTE;
const CARD_TICK_MS = 25 * MS_IN_ONE_SECOND;

type PrJob = { task: string; message: Message };

type ActiveJob = {
  task: string;
  requestedBy: string;
  agentId?: string;
  url?: string;
  startedAt: number;
};

export type QueueSnapshot = {
  active: {
    task: string;
    requestedBy: string;
    agentId?: string;
    url?: string;
    startedAt: number;
  } | null;
  pending: { position: number; task: string; requestedBy: string }[];
};

const queue: PrJob[] = [];
let active: ActiveJob | null = null;
let processing = false;
let ticker: NodeJS.Timeout | null = null;

export function getQueueSnapshot(): QueueSnapshot {
  return {
    active: active ? { ...active } : null,
    pending: queue.map((job, i) => ({
      position: i + 1,
      task: job.task,
      requestedBy: job.message.author.id,
    })),
  };
}

// Non-blocking: enqueue and kick the background worker. Returns immediately.
export function enqueuePullRequest(task: string, message: Message): void {
  queue.push({ task, message });
  void ensureQueueCard(message, getQueueSnapshot());
  void processQueue();
}

function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    void refreshQueueCard(getQueueSnapshot());
  }, CARD_TICK_MS);
  ticker.unref?.();
}

function stopTicker(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function processQueue(): Promise<void> {
  if (processing) return; // a worker is already draining the queue
  processing = true;
  startTicker();
  try {
    while (queue.length) {
      const job = queue.shift()!;
      active = {
        task: job.task,
        requestedBy: job.message.author.id,
        startedAt: Date.now(),
      };
      await refreshQueueCard(getQueueSnapshot());
      try {
        await runPrJob(job);
      } catch (error) {
        console.error(`[tool] openPullRequest job failed: ${error}`);
      }
      active = null;
      await refreshQueueCard(getQueueSnapshot());
    }
  } finally {
    processing = false;
    stopTicker();
    await finalizeQueueCard(getQueueSnapshot());
  }
}

// Runs one PR end to end: launch cloud agent, poll to completion, report result.
async function runPrJob(job: PrJob): Promise<void> {
  const { task, message } = job;
  try {
    const { agentId, runId, url } = await launchPrAgent(task);
    if (active) {
      active.agentId = agentId;
      active.url = url;
    }
    console.log(
      `[tool] openPullRequest agent=${agentId} run=${runId} url=${url}`,
    );
    await refreshQueueCard(getQueueSnapshot());

    const deadline = Date.now() + MAX_WAIT_MS;
    let status = await getRunStatus(agentId, runId);
    while (!status.terminal && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      status = await getRunStatus(agentId, runId);
    }

    if (status.succeeded) {
      await swapReaction(message, LOADING_REACTION, emojis.success);
      await safeReply(
        message,
        status.prUrl
          ? `PR opened: ${status.prUrl}`
          : `Done, but no PR link came back. Track it here: ${url}`,
      );
    } else {
      await swapReaction(message, LOADING_REACTION, emojis.error);
      const reason = status.terminal ? status.status : "timed out";
      await safeReply(
        message,
        `The PR agent didn't finish (${reason}). Track it here: ${url}`,
      );
    }
  } catch (error) {
    await swapReaction(message, LOADING_REACTION, emojis.error);
    await safeReply(
      message,
      `Failed to open the PR. ${error instanceof Error ? error.message : error}`,
    );
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function swapReaction(
  message: Message,
  from: string,
  to: string,
): Promise<void> {
  try {
    const clientId = message.client.user?.id;
    if (clientId) {
      await message.reactions.cache.get(from)?.users.remove(clientId);
    }
  } catch {
    // reaction may already be gone; ignore
  }
  try {
    await message.react(to);
  } catch {
    // ignore
  }
}

async function safeReply(message: Message, content: string): Promise<void> {
  try {
    await message.reply(content);
  } catch (error) {
    console.error(`[tool] openPullRequest reply failed: ${error}`);
  }
}
