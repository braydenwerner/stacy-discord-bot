// Minimal client for the Cursor Cloud Agents REST API (no SDK / native deps).
// Docs: https://cursor.com/docs/cloud-agent/api/endpoints
const API_BASE = "https://api.cursor.com";
const REPO_URL = "https://github.com/braydenwerner/stacy-discord-bot";
const STARTING_REF = "master";

const TERMINAL_STATUSES = new Set([
  "FINISHED",
  "ERROR",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "STOPPED",
]);

export type LaunchedAgent = { agentId: string; runId: string; url: string };

export type RunStatus = {
  status: string;
  prUrl?: string;
  terminal: boolean;
  succeeded: boolean;
};

function authHeaders(): Record<string, string> {
  const key = process.env.CURSOR_API_KEY;
  if (!key) throw new Error("CURSOR_API_KEY is not set.");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// Launches a cloud agent that implements `task` and opens a PR against this repo.
export async function launchPrAgent(task: string): Promise<LaunchedAgent> {
  const res = await fetch(`${API_BASE}/v1/agents`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      prompt: { text: `${task}\n\nImplement this and open a pull request.` },
      repos: [{ url: REPO_URL, startingRef: STARTING_REF }],
      autoCreatePR: true,
      skipReviewerRequest: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`create agent failed: HTTP ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    agent?: { id?: string; url?: string; latestRunId?: string };
    run?: { id?: string };
  };
  const agentId = data.agent?.id;
  const runId = data.run?.id ?? data.agent?.latestRunId;
  if (!agentId || !runId) {
    throw new Error("create agent returned no agent/run id.");
  }
  return {
    agentId,
    runId,
    url: data.agent?.url ?? `https://cursor.com/agents/${agentId}`,
  };
}

// Reads a run's status and (once available) the opened PR url.
export async function getRunStatus(
  agentId: string,
  runId: string,
): Promise<RunStatus> {
  const res = await fetch(
    `${API_BASE}/v1/agents/${agentId}/runs/${runId}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new Error(`get run failed: HTTP ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    status?: string;
    git?: { branches?: { prUrl?: string }[] };
  };
  const status = data.status ?? "UNKNOWN";
  const prUrl = data.git?.branches
    ?.map((b) => b.prUrl)
    .find((u): u is string => typeof u === "string" && u.length > 0);

  return {
    status,
    prUrl,
    terminal: TERMINAL_STATUSES.has(status),
    succeeded: status === "FINISHED",
  };
}
