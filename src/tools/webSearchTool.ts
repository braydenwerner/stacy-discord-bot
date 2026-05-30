import { DynamicStructuredTool } from "@langchain/core/tools";
import { SafeSearchType, search } from "duck-duck-scrape";
import { z } from "zod";

const MAX_RESULTS = 5;
const MAX_ATTEMPTS = 3;

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// DuckDuckGo occasionally returns a transient "anomaly" (anti-bot) error,
// especially under bursts; a short retry usually clears it. (It hard-blocks
// datacenter IPs, but works from residential connections like the Pi.)
async function searchWithRetry(query: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await search(query, { safeSearch: SafeSearchType.MODERATE });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(400 * attempt);
    }
  }
  throw lastError;
}

export const webSearchTool = new DynamicStructuredTool({
  name: "webSearch",
  description:
    "Search the web (via DuckDuckGo) for current, factual, or up-to-date information — news, recent events, facts, or anything that may have changed since your training. Returns the top results with titles, snippets, and links.",
  schema: z.object({
    query: z.string().describe("The search query."),
  }),
  func: async ({ query }) => {
    try {
      const { noResults, results } = await searchWithRetry(query);

      if (noResults || !results?.length) {
        return `No web results found for "${query}".`;
      }

      return results
        .slice(0, MAX_RESULTS)
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n${stripTags(r.description)}\n${r.url}`,
        )
        .join("\n\n");
    } catch (error) {
      // Throw so the caller logs this as a tool error (and can tell the user).
      throw new Error(`Web search failed: ${error}`);
    }
  },
});
