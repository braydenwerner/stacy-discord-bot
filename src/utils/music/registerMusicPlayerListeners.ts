import { escapeMarkdown } from "@discordjs/builders";
import type { GuildQueue, Player, Track } from "discord-player";
import { trackEventPayload } from "@/utils/music/musicMessage";
import { resolveMusicNotifyChannel } from "@/utils/music/requestChannel";
import {
  ensureNowPlayingPanel,
  clearContextPanel,
} from "./musicContextPanel";

// https://github.com/Mirasaki/mirasaki-music-bot/blob/main/src/music-player.js

const EMBED_DESCRIPTION_MAX_LENGTH = 2048;

function notifyChannel(queue: GuildQueue, track?: Track | null) {
  return resolveMusicNotifyChannel(queue, track ?? queue.currentTrack);
}

export function registerMusicPlayerListeners(player: Player) {
  // this event is emitted whenever discord-player starts to play a track
  player.events.on("playerStart", async (queue, track) => {
    if (queue.metadata.disableEmbeds) return;
    
    await ensureNowPlayingPanel(queue);
  });

  player.events.on("error", (queue, error) => {
    if (queue.metadata.disableEmbeds) return;
    const channel = notifyChannel(queue);
    channel?.send({
      embeds: [
        {
          color: 1752220,
          title: "Player Error",
          description: error.message.slice(0, EMBED_DESCRIPTION_MAX_LENGTH),
        },
      ],
    });
  });

  player.events.on("playerError", (queue, err) => {
    console.error("[music] playerError:", err);
    notifyChannel(queue)?.send({
      embeds: [
        {
          color: 0xff0000,
          title: "Playback Error",
          description: String(err?.message ?? err).slice(0, EMBED_DESCRIPTION_MAX_LENGTH),
        },
      ],
    });
  });

  player.events.on("audioTrackAdd", (queue, track) => {
    if (queue.metadata.disableEmbeds) return;
    const channel = notifyChannel(queue, track);
    channel?.send(
      trackEventPayload(track, {
        color: 1752220,
        title: "Track Enqueued",
        description: `[${escapeMarkdown(track.title)}](${track.url})`,
        url: track.url,
      }),
    );
  });

  player.events.on("audioTracksAdd", (queue, tracks) => {
    if (queue.metadata.disableEmbeds) return;
    const first = tracks[0];
    if (!first) return;
    const channel = notifyChannel(queue, first);
    channel?.send(
      trackEventPayload(first, {
        color: 1752220,
        title: "Multiple Tracks Enqueued",
        description: `**${tracks.length}** Tracks\nFirst entry: [${escapeMarkdown(first.title)}](${first.url})`,
        url: first.url,
      }),
    );
  });

  player.events.on("audioTrackRemove", (queue, track) => {
    if (queue.metadata.disableEmbeds) return;
    const channel = notifyChannel(queue, track);
    channel?.send(
      trackEventPayload(track, {
        color: 1752220,
        title: "Track Removed",
        description: `[${escapeMarkdown(track.title)}](${track.url})`,
        url: track.url,
      }),
    );
  });

  player.events.on("audioTracksRemove", (queue, tracks) => {
    if (queue.metadata.disableEmbeds) return;
    const first = tracks[0];
    if (!first) return;
    const channel = notifyChannel(queue, first);
    channel?.send(
      trackEventPayload(first, {
        color: 1752220,
        title: "Multiple Tracks Removed",
        description: `**${tracks.length}** Tracks\nFirst entry: [${escapeMarkdown(first.title)}](${first.url})`,
        url: first.url,
      }),
    );
  });

  player.events.on("playerSkip", (queue, track) => {
    if (queue.metadata.disableEmbeds) return;
    const channel = notifyChannel(queue, track);
    channel?.send(
      trackEventPayload(track, {
        color: 1752220,
        title: "Player Skip",
        description: `Track skipped because the audio stream couldn't be extracted: [${escapeMarkdown(track.title)}](${track.url})`,
        url: track.url,
      }),
    );
  });

  player.events.on("disconnect", (queue) => {
    clearContextPanel(queue.guild.id);
  });

  // player.events.on("emptyChannel", (queue) => {
  //   const settings = getGuildSettings(queue.guild.id);
  //   if (!settings) return;
  //   const ctx = {
  //     embeds: [
  //       {
  //         color: 1752220,
  //         title: "Channel Empty",
  //       },
  //     ],
  //   };
  //   if (!settings.leaveOnEmpty)
  //     ctx.embeds[0].description =
  //       "Staying in channel as leaveOnEnd is disabled";
  //   else
  //     ctx.embeds[0].description = `Leaving empty channel in ${msToHumanReadableTime(
  //       (settings.leaveOnEmptyCooldown ??
  //         clientConfig.defaultLeaveOnEndCooldown) * MS_IN_ONE_SECOND,
  //     )}`;
  //   // Emitted when the voice channel has been empty for the set threshold
  //   // Bot will automatically leave the voice channel with this event
  //   queue.metadata.channel.send(ctx);
  // });

  if (process.env.DEBUG_ENABLED === "true") {
    player.on("debug", console.log);
    player.events.on("debug", async (_, message) => {
      // Emitted when the player queue sends debug info
      // Useful for seeing what state the current queue is at
      console.log(`Player debug event: ${message}`);
    });
    player.on("error", console.log);
  }
}
