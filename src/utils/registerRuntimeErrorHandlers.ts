import { formatError } from "@/utils/formatError";

/** Keep the bot alive when third-party libraries reject in the background. */
export function registerRuntimeErrorHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", formatError(reason));
  });

  process.on("uncaughtException", (error) => {
    console.error("[uncaughtException]", error);
  });
}
