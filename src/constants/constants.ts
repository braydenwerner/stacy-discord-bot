import path from "path";
import { fileURLToPath } from "url";

export const __filename = fileURLToPath(import.meta.url);

export const __dirname = path.dirname(__filename);

export const NS_IN_ONE_MS = 1000000;
export const NS_IN_ONE_SECOND = 1e9;
export const MS_IN_ONE_SECOND = 1000;
export const MS_IN_ONE_MINUTE = 60000;
export const MS_IN_ONE_HOUR = 3600000;
export const MS_IN_ONE_DAY = 864e5;

export const EMBED_DESCRIPTION_MAX_LENGTH = 2048;

export const emojis = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
};
