import type { APIEmbed } from "discord.js";
import type { EmbedBuilder } from "discord.js";
import type { GuildQueue, Track } from "discord-player";

/** Raw URL in message content so Discord shows native link previews (YouTube, etc.). */
export function trackLinkPreviewContent(
  track?: Pick<Track, "url"> | null,
): string | undefined {
  const url = track?.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  return url;
}

export function queueLinkPreviewContent(queue: GuildQueue): string | undefined {
  return trackLinkPreviewContent(queue.currentTrack);
}

type MusicPayload = {
  content?: string;
  embeds: APIEmbed[] | EmbedBuilder[];
};

export function withLinkPreview(
  payload: Omit<MusicPayload, "content">,
  previewUrl?: string,
): MusicPayload {
  if (!previewUrl) return payload;
  return { ...payload, content: previewUrl };
}

export function trackEventPayload(
  track: Track,
  embed: APIEmbed,
): MusicPayload {
  return withLinkPreview({ embeds: [embed] }, trackLinkPreviewContent(track));
}
