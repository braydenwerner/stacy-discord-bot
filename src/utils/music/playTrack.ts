import type { PlaylistTrack } from "@/db/playlists";
import { formatErrorForUser } from "@/utils/formatError";
import { truncateMessage } from "@/utils/truncateMessage";
import { QueryType, useMainPlayer } from "discord-player";
import {
  syncQueueRequestMetadata,
  tagTracksWithRequest,
} from "@/utils/music/requestChannel";
import type {
  GuildMember,
  Message,
  TextBasedChannel,
  User,
} from "discord.js";

export type PlayTarget = {
  url?: string | null;
  songName?: string | null;
  artist?: string | null;
};

export type PlayContext = {
  channel: TextBasedChannel;
  member: GuildMember | null;
  user: User;
  /** Original chat message when playback was requested via Stacy chat. */
  requestMessage?: Message;
  reply: (text: string) => Promise<unknown>;
};

export function playTargetFromPlaylistTrack(track: PlaylistTrack): PlayTarget {
  return {
    url: track.url,
    songName: track.title,
    artist: track.artist,
  };
}

export async function playTrack(
  ctx: PlayContext,
  target: PlayTarget,
): Promise<boolean> {
  const voiceChannel = ctx.member?.voice?.channel;
  if (!voiceChannel) {
    await ctx.reply("You need to be in a voice channel to play music!");
    return false;
  }

  const url = target.url?.trim() || undefined;
  const songName = target.songName?.trim() || "";
  const artist = target.artist?.trim();
  const query = `${songName} ${artist ? `by ${artist}` : ""}`.trim();

  if (!url && !query) {
    await ctx.reply("Nothing to play — provide a title or URL.");
    return false;
  }

  try {
    const player = useMainPlayer();
    const searchResult = await player.search(url || query, {
      searchEngine: url ? QueryType.AUTO : QueryType.YOUTUBE_SEARCH,
      fallbackSearchEngine: QueryType.YOUTUBE_SEARCH,
      requestedBy: ctx.user,
    });

    if (!searchResult?.tracks?.length) {
      await ctx.reply("Couldn't find that song.");
      return false;
    }

    tagTracksWithRequest(searchResult.tracks, ctx);
    const existingQueue = player.nodes.get(voiceChannel.guild.id);
    if (existingQueue) {
      syncQueueRequestMetadata(existingQueue, ctx);
    }

    const { track, queue } = await player.play(voiceChannel, searchResult, {
      nodeOptions: {
        metadata: {
          channel: ctx.channel,
          member: ctx.member,
          requestMessage: ctx.requestMessage,
        },
      },
    });

    if (!track) {
      await ctx.reply("Failed to play song.");
      return false;
    }

    syncQueueRequestMetadata(queue, ctx);
    tagTracksWithRequest(searchResult.tracks, ctx);

    return true;
  } catch (error) {
    console.error("[music] playTrack failed:", error);
    await ctx.reply(formatErrorForUser(error));
    return false;
  }
}

export function playContextFromMessage(message: Message): PlayContext {
  return {
    channel: message.channel,
    member: message.member,
    user: message.author,
    requestMessage: message,
    reply: (text) => message.reply(truncateMessage(text)),
  };
}
