// https://js.langchain.com/docs/modules/chains/additional/openai_functions/

import { FAVORED_USER_ID } from "@/constants/constants";
import type { CustomClient } from "@/index";
import {
  lyricsTool,
  pauseOrResumeSongTool,
  playSongTool,
  skipSongTool,
  viewSongQueueTool,
} from "@/tools/musicPlayerTools";
// import { playSongTool } from "@/tools/playSongTool";
import {
  NICE_SYSTEM_PROMPT,
  SNARKY_SYSTEM_PROMPT,
  llm,
  sessionConfig,
  withHistory,
} from "@/utils/useMessageHistory";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { type Message } from "discord.js";

const tools: Record<string, DynamicStructuredTool> = {
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

  const filteredMessageContent = message.content.replace(/stacy/gi, "");

  const isFavoredUser = message.author.id === FAVORED_USER_ID;
  const systemPrompt = isFavoredUser ? NICE_SYSTEM_PROMPT : SNARKY_SYSTEM_PROMPT;
  const config = sessionConfig(message.author.id);

  console.log(
    `[tone] user=${message.author.tag} (${message.author.id}) tone=${
      isFavoredUser ? "nice" : "snarky"
    } message="${message.content}"`,
  );

  // Determine whether or not to invoke a tool
  const res = await llmWithTools.invoke(filteredMessageContent);

  if (res.tool_calls?.length === 0) {
    // If there is no tool to invoke, simply respond to the user's message
    const output = await withHistory.invoke(
      {
        input: message.content,
        systemPrompt,
      },
      config,
    );

    message.reply(output.content as string);
  } else {
    // If there is a tool to invoke, do so
    for (const toolCall of res.tool_calls ?? []) {
      console.log({ ...toolCall.args, message });

      if (!tools[toolCall.name]) {
        const output = await withHistory.invoke(
          {
            input: message.content,
            systemPrompt,
          },
          config,
        );

        message.reply(output.content as string);
        continue;
      }

      await tools[toolCall.name].invoke({
        ...toolCall.args,
        message,
      });
    }
  }
}
