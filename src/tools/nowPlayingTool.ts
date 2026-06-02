import { emojis } from "@/constants/constants";
import { truncateMessage } from "@/utils/truncateMessage";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { useQueue } from "discord-player";
import { Message } from "discord.js";
import { z } from "zod";
import { createOrUpdateContextPanel } from "../utils/music/musicContextPanel";

function getMessage(config?: RunnableConfig): Message {
  const message = (config?.configurable as { message?: Message } | undefined)
    ?.message;
  if (!message) throw new Error("No Discord message provided to tool.");
  return message;
}

export const nowPlayingTool = new DynamicStructuredTool({
  name: "nowPlaying",
  description: "Shows the currently playing song and music player controls.",
  schema: z.object({}),
  func: async (_input, _runManager, config) => {
    const message = getMessage(config);
    try {
      const voiceChannel = message.member?.voice.channel;

      if (!message?.guild?.id) throw new Error("No guild found.");
      if (!voiceChannel) {
        message.reply(
          truncateMessage("You need to be in a voice channel to view now playing!"),
        );
        return "";
      }

      const queue = useQueue(message.guild.id);
      if (!queue || !queue.currentTrack) {
        message.reply({
          content: truncateMessage(`${emojis.error} ${message.member}, no song is currently playing.`),
        });
        return "";
      }

      // Show now playing in unified context panel
      await createOrUpdateContextPanel(message, queue, "nowPlaying");
    } catch (error) {
      message.reply(truncateMessage(`Failed to show now playing. ${error}`));
      throw error;
    }

    return "";
  },
});
