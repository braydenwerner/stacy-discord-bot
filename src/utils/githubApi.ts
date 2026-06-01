import { Octokit } from "@octokit/rest";

/**
 * Parses a GitHub PR URL to extract owner, repo, and PR number.
 * @param prUrl - The GitHub PR URL (e.g., "https://github.com/owner/repo/pull/123")
 * @returns Object with owner, repo, and pull_number, or null if invalid
 */
export function parsePrUrl(prUrl: string): {
  owner: string;
  repo: string;
  pull_number: number;
} | null {
  try {
    const url = new URL(prUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    
    if (parts.length >= 4 && parts[2] === "pull") {
      return {
        owner: parts[0],
        repo: parts[1],
        pull_number: parseInt(parts[3], 10),
      };
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Marks a GitHub pull request as ready for review (converts from draft to ready).
 * @param prUrl - The GitHub PR URL
 * @returns Promise that resolves when the PR is marked as ready
 */
export async function markPrAsReady(prUrl: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn(
      "[github] GITHUB_TOKEN not set, skipping mark PR as ready for:",
      prUrl,
    );
    return;
  }

  const prInfo = parsePrUrl(prUrl);
  if (!prInfo) {
    console.error("[github] Invalid PR URL:", prUrl);
    return;
  }

  const octokit = new Octokit({ auth: token });

  try {
    // First, check if the PR is actually a draft
    const { data: pr } = await octokit.pulls.get({
      owner: prInfo.owner,
      repo: prInfo.repo,
      pull_number: prInfo.pull_number,
    });

    if (!pr.draft) {
      console.log("[github] PR is already ready for review:", prUrl);
      return;
    }

    // Mark the PR as ready for review
    await octokit.pulls.update({
      owner: prInfo.owner,
      repo: prInfo.repo,
      pull_number: prInfo.pull_number,
      draft: false,
    });

    console.log("[github] Marked PR as ready for review:", prUrl);
  } catch (error) {
    console.error("[github] Failed to mark PR as ready:", error);
    throw error;
  }
}
