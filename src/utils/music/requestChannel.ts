import type { GuildQueue, Track } from "discord-player";
import type { PlayContext } from "@/utils/music/playTrack";
import type { Message, SendableChannels } from "discord.js";

export type TrackRequestMeta = {
  channelId: string;
};

export function tagTracksWithRequest(
  tracks: Track[],
  ctx: PlayContext,
): void {
  const meta: TrackRequestMeta = { channelId: ctx.channel.id };
  for (const track of tracks) {
    track.setMetadata(meta);
  }
}

/** Latest requester context on the shared guild queue (used as fallback). */
export function syncQueueRequestMetadata(
  queue: GuildQueue,
  ctx: PlayContext,
): void {
  queue.metadata = {
    ...queue.metadata,
    channel: ctx.channel,
    member: ctx.member,
    requestMessage: ctx.requestMessage,
  };
}

function channelFromId(
  queue: GuildQueue,
  channelId: string,
): SendableChannels | null {
  const channel = queue.guild.channels.cache.get(channelId);
  return channel?.isSendable() ? channel : null;
}

/** Text channel where music notifications for this track should be posted. */
export function resolveMusicNotifyChannel(
  queue: GuildQueue,
  track?: Track | null,
): SendableChannels | null {
  const trackMeta = track?.metadata as TrackRequestMeta | null;
  if (trackMeta?.channelId) {
    const fromTrack = channelFromId(queue, trackMeta.channelId);
    if (fromTrack) return fromTrack;
  }

  const metaChannel = queue.metadata?.channel;
  if (metaChannel?.isSendable()) {
    return metaChannel;
  }

  const requestMessage = queue.metadata?.requestMessage as Message | undefined;
  if (requestMessage?.channel?.isSendable()) {
    return requestMessage.channel;
  }

  return null;
}
