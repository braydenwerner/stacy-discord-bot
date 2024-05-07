// https://js.langchain.com/docs/modules/chains/additional/openai_functions/

import type { CustomClient } from "@/index";
import { MUSIC_PLAYER, musicPlayerTool } from "@/utils/musicPlayerTool";
import { config, llm, withHistory } from "@/utils/useMessageHistory";
import type { Message } from "discord.js";

const llmWithTools = llm.bindTools([musicPlayerTool]);

export default async function messageCreate(
  client: CustomClient,
  message: Message,
) {
  if (message.author.bot) return;

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
      if (toolCall.name === MUSIC_PLAYER) {
        await musicPlayerTool.invoke({
          ...toolCall.args,
          client,
          message,
        });
      }
    }
  }
}
