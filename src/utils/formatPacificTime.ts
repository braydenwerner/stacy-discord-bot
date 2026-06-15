const PACIFIC = "America/Los_Angeles";

/** e.g. "Jun 5, 2026, 10:00 AM PST" */
export function formatPacificDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: PACIFIC,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Parse backup key stamp (e.g. 20260605T180006Z) to a Date. */
export function parseBackupKeyStamp(stamp: string): Date | null {
  const compact = stamp.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
  );
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact;
    return new Date(
      Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!),
    );
  }
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function formatBackupStampPacific(stamp: string): string {
  const date = parseBackupKeyStamp(stamp);
  return date ? formatPacificDateTime(date) : stamp;
}
