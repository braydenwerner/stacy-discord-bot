// https://github.com/Mirasaki/mirasaki-music-bot/blob/main/src/modules/music.js#L18

import { GuildQueue, QueueRepeatMode, Track } from "discord-player";
import { EmbedBuilder, Guild, Message } from "discord.js";

import { msToHumanReadableTime } from "@utils/util";

const repeatModeEmojiStr = (repeatMode: QueueRepeatMode) =>
  repeatMode === QueueRepeatMode.AUTOPLAY
    ? ":gear: Autoplay"
    : repeatMode === QueueRepeatMode.QUEUE
      ? ":repeat: Queue"
      : repeatMode === QueueRepeatMode.TRACK
        ? ":repeat_one: Track"
        : ":arrow_forward: Off";

const queueTrackCb = (track: Track, idx: number) =>
  `${++idx}: (${track.duration}) [**${track.title}**](${track.url})`;

function queueEmbeds(queue: GuildQueue, guild: Guild, title: string) {
  const currQueue = queue.tracks.toArray();
  const repeatModeStr = repeatModeEmojiStr(queue.repeatMode);
  const usableEmbeds = [];
  const chunkSize = 10;

  for (let i = 0; i < currQueue.length; i += chunkSize) {
    const chunk = currQueue.slice(i, i + chunkSize);
    const embed = new EmbedBuilder().setColor(1752220).setAuthor({
      name: `${title} for ${guild.name}`,
      iconURL: guild.iconURL() ?? undefined,
    });

    // Resolve string output
    const chunkOutput = chunk
      .map((e, ind) => queueTrackCb(e, ind + i))
      .join("\n");

    // Construct our embed
    embed
      .setDescription(
        `
            **:musical_note: Now Playing:** ${queue.currentTrack?.title}${typeof queue.repeatMode !== "undefined" && queue.repeatMode !== null ? `\n**Repeat/Loop Mode:** ${repeatModeStr}` : ""}
  
            ${chunkOutput}
          `,
      )
      .setImage(chunk[0]?.thumbnail)
      .setFooter({
        text: `Page ${Math.ceil((i + chunkSize) / chunkSize)} of ${
          Math.ceil(currQueue.length / chunkSize)
          // eslint-disable-next-line sonarjs/no-nested-template-literals
        } (${i + 1}-${Math.min(i + chunkSize, currQueue.length)} / ${currQueue.length})${queue.estimatedDuration ? `\nEstimated Time Remaining: ${msToHumanReadableTime(queue.estimatedDuration)}` : ""}`,
      });

    // Always push to usable embeds
    usableEmbeds.push(embed);
  }

  return usableEmbeds;
}

export function queueEmbedResponse(
  message: Message,
  queue: GuildQueue,
  title = "Queue",
) {
  const { guild, member } = message;
  if (!guild || !member) return;

  const usableEmbeds = queueEmbeds(queue, guild, title);

  // Queue empty
  if (usableEmbeds.length === 0)
    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(1752220)
          .setAuthor({
            name: `${title} for ${guild?.name}`,
            iconURL: guild.iconURL() ?? undefined,
          })
          .setDescription(`${title} is currently empty`),
      ],
    });
  // Reply to the interaction with the SINGLE embed
  else if (usableEmbeds.length === 1)
    message.reply({ embeds: usableEmbeds }).catch(() => {
      /* Void */
    });
}
