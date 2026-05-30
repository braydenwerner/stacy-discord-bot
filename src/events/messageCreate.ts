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
import { fetchPageTool } from "@/tools/fetchPageTool";
import { webSearchTool } from "@/tools/webSearchTool";
import {
  NICE_SYSTEM_PROMPT,
  SNARKY_SYSTEM_PROMPT,
  chain,
  getHistory,
  llm,
  recordTurn,
} from "@/utils/useMessageHistory";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { type Message } from "discord.js";

// Action tools perform something and reply to Discord themselves.
const tools: Record<string, DynamicStructuredTool> = {
  [playSongTool.name]: playSongTool,
  [pauseOrResumeSongTool.name]: pauseOrResumeSongTool,
  [skipSongTool.name]: skipSongTool,
  [viewSongQueueTool.name]: viewSongQueueTool,
  [lyricsTool.name]: lyricsTool,
};

// Read tools return text that gets fed back to the model for a persona-voiced answer.
const readTools: Record<string, DynamicStructuredTool> = {
  [webSearchTool.name]: webSearchTool,
  [fetchPageTool.name]: fetchPageTool,
};

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

  const isFavoredUser = message.author.id === FAVORED_USER_ID;
  const systemPrompt = isFavoredUser ? NICE_SYSTEM_PROMPT : SNARKY_SYSTEM_PROMPT;
  const sessionId = message.author.id;

  console.log(
    `[tone] user=${message.author.tag} (${message.author.id}) tone=${
      isFavoredUser ? "nice" : "snarky"
    } message="${message.content}"`,
  );

  const history = getHistory(sessionId);

  // A single LLM call both decides whether to run a tool and produces the
  // conversational reply (previously two separate calls).
  const aiMessage = await chain.invoke({
    systemPrompt,
    history,
    input: message.content,
  });

  const toolCalls = aiMessage.tool_calls ?? [];
  const content = typeof aiMessage.content === "string" ? aiMessage.content : "";

  if (toolCalls.length === 0) {
    if (content) message.reply(content);
    recordTurn(sessionId, message.content, content);
    return;
  }

  // Action (music) tools reply to Discord themselves; read tools (web search,
  // page fetch) return text that must be fed back to the model for a
  // persona-voiced answer. Collect a tool result message for every call so the
  // follow-up request is valid (each tool_call needs a matching tool message).
  const toolMessages: ToolMessage[] = [];
  let needsFollowup = false;

  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.id ?? toolCall.name;
    const start = Date.now();
    console.log(
      `[tool] call ${toolCall.name} user=${message.author.id} args=${JSON.stringify(toolCall.args)}`,
    );

    try {
      if (readTools[toolCall.name]) {
        const result = await readTools[toolCall.name].invoke(toolCall);
        const text =
          typeof result === "string"
            ? result
            : ((result as { content?: unknown })?.content?.toString() ?? "");
        toolMessages.push(
          new ToolMessage({ content: text, tool_call_id: toolCallId }),
        );
        needsFollowup = true;
        console.log(
          `[tool] success ${toolCall.name} (${Date.now() - start}ms, ${text.length} chars)`,
        );
      } else if (tools[toolCall.name]) {
        // Inject the Discord message via runtime config so it never has to live
        // in the tool's (token-costly) JSON schema.
        await tools[toolCall.name].invoke(toolCall.args, {
          configurable: { message },
        });
        toolMessages.push(
          new ToolMessage({ content: "Done.", tool_call_id: toolCallId }),
        );
        console.log(`[tool] success ${toolCall.name} (${Date.now() - start}ms)`);
      } else {
        console.warn(`[tool] unknown tool ${toolCall.name}`);
        toolMessages.push(
          new ToolMessage({
            content: "Unknown tool.",
            tool_call_id: toolCallId,
          }),
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `[tool] error ${toolCall.name} (${Date.now() - start}ms): ${reason}`,
      );
      toolMessages.push(
        new ToolMessage({
          content: `The ${toolCall.name} tool failed: ${reason}`,
          tool_call_id: toolCallId,
        }),
      );
      // Let read-tool failures flow to a follow-up so Stacy can explain in-persona.
      if (readTools[toolCall.name]) needsFollowup = true;
    }
  }

  if (needsFollowup) {
    const followup = await llm.invoke([
      new SystemMessage(systemPrompt),
      ...history,
      new HumanMessage(message.content),
      aiMessage as AIMessage,
      ...toolMessages,
    ]);
    const answer =
      typeof followup.content === "string" ? followup.content : "";
    if (answer) message.reply(answer);
    recordTurn(sessionId, message.content, answer);
    return;
  }

  if (content) message.reply(content);
  recordTurn(
    sessionId,
    message.content,
    content || "(handled the requested action)",
  );
}
