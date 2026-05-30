import { lookup } from "dns/promises";

import { DynamicStructuredTool } from "@langchain/core/tools";
import { convert } from "html-to-text";
import { z } from "zod";

const MAX_CHARS = 6000;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 5_000_000;

function isPrivateIp(ip: string): boolean {
  if (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "0.0.0.0"
  ) {
    return true;
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6.startsWith("fe80:") ||
    v6.startsWith("fc") ||
    v6.startsWith("fd")
  );
}

// Guard against SSRF: only http(s), and never anything that resolves to a
// loopback / private / link-local address (the Pi itself or the home LAN).
async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Refusing to fetch a local address.");
  }
  const { address } = await lookup(host);
  if (isPrivateIp(address)) {
    throw new Error("Refusing to fetch a private/internal address.");
  }
  return url;
}

export const fetchPageTool = new DynamicStructuredTool({
  name: "fetchPage",
  description:
    "Fetch a web page by URL and return its readable text content. Use this to read, quote, or summarize a link the user provides.",
  schema: z.object({
    url: z.string().describe("The full http(s) URL to fetch."),
  }),
  func: async ({ url }) => {
    try {
      const safeUrl = await assertSafeUrl(url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(safeUrl, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "StacyBot/1.0 (Discord bot; +https://github.com/braydenwerner/stacy-discord-bot)",
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      // Re-validate after redirects so a redirect can't bounce us to an
      // internal address.
      await assertSafeUrl(res.url || safeUrl.toString());

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const body = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;

      let text = contentType.includes("html")
        ? convert(body, {
            wordwrap: false,
            selectors: [
              { selector: "a", options: { ignoreHref: true } },
              { selector: "img", format: "skip" },
              { selector: "nav", format: "skip" },
              { selector: "footer", format: "skip" },
            ],
          })
        : body;

      text = text.replace(/\n{3,}/g, "\n\n").trim();
      if (!text) return "The page returned no readable text.";
      if (text.length > MAX_CHARS) {
        text = `${text.slice(0, MAX_CHARS)}\n…(truncated)`;
      }
      return text;
    } catch (error) {
      // Throw so the caller logs this as a tool error (and can tell the user).
      throw new Error(`Failed to read page: ${error}`);
    }
  },
});
