import { FAVORED_USER_ID } from "@/constants/constants";
import { enqueuePullRequest } from "@/utils/prQueue";
import { getToolMessage } from "@/utils/getToolMessage";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const LOADING_REACTION = "\u23f3"; // hourglass

export const openPullRequestTool = new DynamicStructuredTool({
  name: "openPullRequest",
  description:
    "Open a GitHub pull request against this bot's own repository by launching a Cursor cloud agent that implements the change. " +
    'ONLY use this when the user explicitly asks to open/create/make a pull request or PR (e.g. "open a PR to add X"). ' +
    "Pass the full description of what the PR should do as `task`.",
  schema: z.object({
    task: z
      .string()
      .describe("A full description of what the pull request should do/implement."),
  }),
  func: async ({ task }, _runManager, config) => {
    const message = getToolMessage(config);

    // Hard gate: only the owner may open PRs (the real boundary, independent of persona).
    if (message.author.id !== FAVORED_USER_ID) {
      message.reply(truncateMessage("I can't open pull requests for you."));
      return "";
    }

    if (!process.env.CURSOR_API_KEY) {
      message.reply(truncateMessage("PR support isn't configured yet (missing CURSOR_API_KEY)."));
      return "";
    }

    // Loading spinner; the queue worker swaps it for a check/cross when done.
    try {
      await message.react(LOADING_REACTION);
    } catch {
      // ignore reaction failures
    }

    enqueuePullRequest(task, message);
    return "";
  },
});
