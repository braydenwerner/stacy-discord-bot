// https://js.langchain.com/docs/modules/chains/additional/openai_functions/

import type { CustomClient } from "@/index";
import {
  lyricsTool,
  pauseOrResumeSongTool,
  playSongTool,
  skipSongTool,
  viewSongQueueTool,
} from "@/utils/music/musicPlayerTools";
import { config, llm, withHistory } from "@/utils/useMessageHistory";
import { MessageType, type Message } from "discord.js";

const tools = {
  [playSongTool.name]: playSongTool,
  [pauseOrResumeSongTool.name]: pauseOrResumeSongTool,
  [skipSongTool.name]: skipSongTool,
  [viewSongQueueTool.name]: viewSongQueueTool,
  [lyricsTool.name]: lyricsTool,
};

const llmWithTools = llm.bindTools(Object.values(tools));

export default async function messageCreate(
  client: CustomClient,
  message: Message,
) {
  let isReplyToStacy = false;
  if (message.reference?.messageId != null) {
    const repliedMessage = await message.channel.messages.fetch(
      message.reference.messageId,
    );
    isReplyToStacy = repliedMessage.author.id === client.user?.id;
  }

  if (
    message.author.bot ||
    (!message.content.toUpperCase().includes("STACY") && !isReplyToStacy)
  ) {
    return;
  }

  // Determine whether or not to invoke a tool
  const res = await llmWithTools.invoke(message.content);

  if (res.tool_calls?.length === 0) {
    // If there is no tool to invoke, simply respond to the user's message
    const output = await withHistory.invoke(
      {
        input: message.content,
      },
      config,
    );

    message.reply(output.content as string);
  } else {
    // If there is a tool to invoke, do so
    for (const toolCall of res.tool_calls ?? []) {
      await tools[toolCall.name].invoke({
        ...toolCall.args,
        client,
        message,
      });
    }
  }
}
