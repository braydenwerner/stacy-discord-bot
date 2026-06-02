import { useQueue } from "discord-player";

export type CurrentTrackSnapshot = {
  title: string;
  artist: string | null;
  url: string;
};

/** Currently playing track in this guild's voice session (URL required for playlist save). */
export function getCurrentTrackForGuild(
  guildId: string | null | undefined,
): CurrentTrackSnapshot | null {
  if (!guildId) return null;

  const track = useQueue(guildId)?.currentTrack;
  if (!track?.url?.trim()) return null;

  return {
    title: track.title,
    artist: track.author ?? null,
    url: track.url.trim(),
  };
}

/** Lyrics search string: explicit song/artist, else the guild's now-playing track. */
export function buildLyricsSearchQuery(
  guildId: string | null | undefined,
  input?: { songName?: string; artist?: string },
): string | null {
  const songName = input?.songName?.trim();
  const artist = input?.artist?.trim();
  if (songName || artist) {
    return `${songName ?? ""}${artist ? ` by ${artist}` : ""}`.trim();
  }

  if (!guildId) return null;

  const current = useQueue(guildId)?.currentTrack;
  const title = current?.title?.trim();
  if (!title) return null;

  const trackArtist = current?.author?.trim();
  return trackArtist ? `${title} by ${trackArtist}` : title;
}

export function defaultTrackLabelFromTitle(title: string): string {
  const label = title.trim().slice(0, 48);
  return label || "track";
}

export type ResolvedTrackAdd = {
  title: string;
  artist?: string;
  url: string;
};

/**
 * Resolve fields for playlist add. When title/URL are omitted, uses the guild's
 * now-playing track and always stores its URL so playback can replay exactly.
 */
export function resolveTrackAddFromInput(
  guildId: string | null | undefined,
  input: { title?: string; artist?: string; url?: string },
): ResolvedTrackAdd {
  if (input.url?.trim()) {
    const url = input.url.trim();
    const title = input.title?.trim() || url;
    return {
      title,
      artist: input.artist?.trim() || undefined,
      url,
    };
  }

  if (!input.title?.trim()) {
    const now = getCurrentTrackForGuild(guildId);
    if (!now) {
      throw new Error(
        "Nothing is playing with a saveable URL. Start a track in voice first, or provide a **url** (or title + url).",
      );
    }
    return {
      title: now.title,
      artist: input.artist?.trim() || now.artist || undefined,
      url: now.url,
    };
  }

  throw new Error(
    "Provide a **url** for the track, or omit title/url to save what's currently playing (uses its URL).",
  );
}
