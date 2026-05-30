import { DynamicStructuredTool } from "@langchain/core/tools";
import { SafeSearchType, search } from "duck-duck-scrape";
import { z } from "zod";

const MAX_RESULTS = 5;
const DDG_MAX_ATTEMPTS = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Short-term cache so repeated/burst queries don't hammer the provider (helps
// with DuckDuckGo rate limits and saves Tavily credits / tokens).
const cache = new Map<string, { text: string; expires: number }>();

function getCached(key: string): string | undefined {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.text;
  if (hit) cache.delete(key);
  return undefined;
}

function setCached(key: string, text: string): void {
  cache.set(key, { text, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// Tavily REST API — reliable, free tier (~1,000 searches/month). Used when
// TAVILY_API_KEY is set. No SDK needed; this is a plain fetch.
async function tavilySearch(query: string): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: MAX_RESULTS,
      include_answer: true,
      search_depth: "basic",
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    answer?: string;
    results?: { title: string; url: string; content: string }[];
  };

  const parts: string[] = [];
  if (data.answer) parts.push(`Answer: ${data.answer}`);
  for (const [i, r] of (data.results ?? []).slice(0, MAX_RESULTS).entries()) {
    parts.push(`${i + 1}. ${r.title}\n${r.content}\n${r.url}`);
  }
  return parts.length
    ? parts.join("\n\n")
    : `No web results found for "${query}".`;
}

// DuckDuckGo (free, no key) fallback. DDG occasionally throws a transient
// "anomaly" anti-bot error and rate-limits scrapers; retry with backoff.
async function duckDuckGoSearch(query: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DDG_MAX_ATTEMPTS; attempt++) {
    try {
      const { noResults, results } = await search(query, {
        safeSearch: SafeSearchType.MODERATE,
      });
      if (noResults || !results?.length) {
        return `No web results found for "${query}".`;
      }
      return results
        .slice(0, MAX_RESULTS)
        .map(
          (r, i) => `${i + 1}. ${r.title}\n${stripTags(r.description)}\n${r.url}`,
        )
        .join("\n\n");
    } catch (error) {
      lastError = error;
      if (attempt < DDG_MAX_ATTEMPTS) {
        // Exponential backoff with jitter: ~0.8s, 1.6s, 3.2s (+/- jitter).
        await sleep(800 * 2 ** (attempt - 1) + Math.random() * 400);
      }
    }
  }
  throw new Error(
    `DuckDuckGo search failed (rate limited?). Set TAVILY_API_KEY for reliable search. ${lastError}`,
  );
}

export const webSearchTool = new DynamicStructuredTool({
  name: "webSearch",
  description:
    "Search the web for current, factual, or up-to-date information — news, recent events, facts, or anything that may have changed since your training. Returns the top results with titles, snippets, and links.",
  schema: z.object({
    query: z.string().describe("The search query."),
  }),
  func: async ({ query }) => {
    const key = query.trim().toLowerCase();
    const cached = getCached(key);
    if (cached) return cached;

    try {
      const text = process.env.TAVILY_API_KEY
        ? await tavilySearch(query)
        : await duckDuckGoSearch(query);
      setCached(key, text);
      return text;
    } catch (error) {
      // Throw so the caller logs this as a tool error (and can tell the user).
      throw new Error(`Web search failed: ${error}`);
    }
  },
});
