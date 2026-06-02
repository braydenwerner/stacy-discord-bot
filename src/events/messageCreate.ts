// https://js.langchain.com/docs/modules/chains/additional/openai_functions/

import { isFavoredUser } from "@/utils/favoredUsers";
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
import { manageToneListTool } from "@/tools/manageToneListTool";
import { openPullRequestTool } from "@/tools/openPullRequestTool";
import { listContactsTool } from "@/tools/listContactsTool";
import { listUserGroupsTool } from "@/tools/listUserGroupsTool";
import { manageContactTool } from "@/tools/manageContactTool";
import { createGroupTool } from "@/tools/createGroupTool";
import { manageUserGroupTool } from "@/tools/manageUserGroupTool";
import { pingGroupTool } from "@/tools/pingGroupTool";
import { sendMessageTool } from "@/tools/sendMessageTool";
import { webSearchTool } from "@/tools/webSearchTool";
import { toolResultNeedsFollowUp } from "@/utils/toolResult";
import { recordUsage } from "@/utils/tokenTracker";
import { truncateMessage } from "@/utils/truncateMessage";
import {
  NICE_SYSTEM_PROMPT,
  SNARKY_SYSTEM_PROMPT,
  getHistory,
  llmWithTools,
  recordTurn,
} from "@/utils/useMessageHistory";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { type Message } from "discord.js";

// Cap on agent loop iterations (tool calls -> results -> next step).
const MAX_STEPS = 5;

// Action tools perform something and reply to Discord themselves.
const tools: Record<string, DynamicStructuredTool> = {
  [playSongTool.name]: playSongTool,
  [pauseOrResumeSongTool.name]: pauseOrResumeSongTool,
  [skipSongTool.name]: skipSongTool,
  [viewSongQueueTool.name]: viewSongQueueTool,
  [lyricsTool.name]: lyricsTool,
  [sendMessageTool.name]: sendMessageTool,
  [manageContactTool.name]: manageContactTool,
  [createGroupTool.name]: createGroupTool,
  [manageUserGroupTool.name]: manageUserGroupTool,
  [listContactsTool.name]: listContactsTool,
  [listUserGroupsTool.name]: listUserGroupsTool,
  [pingGroupTool.name]: pingGroupTool,
  [manageToneListTool.name]: manageToneListTool,
  [openPullRequestTool.name]: openPullRequestTool,
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

  const userIsFavored = isFavoredUser(message.author.id);
  const systemPrompt = userIsFavored ? NICE_SYSTEM_PROMPT : SNARKY_SYSTEM_PROMPT;
  const sessionId = message.author.id;

  console.log(
    `[tone] user=${message.author.tag} (${message.author.id}) tone=${
      userIsFavored ? "nice" : "snarky"
    } message="${message.content}"`,
  );

  // Build the running conversation for this turn and run a bounded agent loop:
  // the model can call tools, see their results, and call more tools (e.g.
  // search the web, then send the result to someone) before answering.
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...getHistory(sessionId),
    new HumanMessage(message.content),
  ];

  let finalText = "";
  let didAction = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const aiMessage = await llmWithTools.invoke(messages);
    recordUsage(aiMessage.usage_metadata);
    messages.push(aiMessage);

    const toolCalls = aiMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalText =
        typeof aiMessage.content === "string" ? aiMessage.content : "";
      break;
    }

    // Read tools (web search, page fetch) return text the model needs to keep
    // working; action tools (music, sendMessage, pingGroup) reply to Discord
    // themselves. Every tool call needs a matching tool result message.
    let usedReadTool = false;

    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id ?? toolCall.name;
      const start = Date.now();
      console.log(
        `[tool] call ${toolCall.name} user=${message.author.id} args=${JSON.stringify(toolCall.args)}`,
      );

      try {
        if (readTools[toolCall.name]) {
          const result = await readTools[toolCall.name].invoke(
            toolCall.args ?? {},
            { configurable: { message } },
          );
          const text =
            typeof result === "string"
              ? result
              : ((result as { content?: unknown })?.content?.toString() ?? "");
          messages.push(
            new ToolMessage({ content: text, tool_call_id: toolCallId }),
          );
          usedReadTool = true;
          console.log(
            `[tool] success ${toolCall.name} (${Date.now() - start}ms, ${text.length} chars)`,
          );
        } else if (tools[toolCall.name]) {
          const result = await tools[toolCall.name].invoke(toolCall.args, {
            configurable: { message },
          });
          const text =
            typeof result === "string" && result.length > 0
              ? result
              : "OK: Action completed.";
          messages.push(
            new ToolMessage({ content: text, tool_call_id: toolCallId }),
          );
          didAction = true;
          if (toolResultNeedsFollowUp(text)) usedReadTool = true;
          console.log(
            `[tool] success ${toolCall.name} (${Date.now() - start}ms) result=${text.slice(0, 80)}`,
          );
        } else {
          console.warn(`[tool] unknown tool ${toolCall.name}`);
          messages.push(
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
        messages.push(
          new ToolMessage({
            content: `The ${toolCall.name} tool failed: ${reason}`,
            tool_call_id: toolCallId,
          }),
        );
        // A failed read tool should still let the model respond/explain.
        if (readTools[toolCall.name]) usedReadTool = true;
      }
    }

    // Keep looping while read tools are in play so the model can act on (or
    // explain) their results. If only action tools ran, they've already
    // replied to the channel, so stop without another (chatty) model call.
    if (!usedReadTool) break;
  }

  if (finalText) {
    const truncatedText = truncateMessage(finalText);
    message.reply(truncatedText);
    recordTurn(sessionId, message.content, finalText);
  } else {
    recordTurn(
      sessionId,
      message.content,
      didAction ? "(handled the requested action)" : "",
    );
  }
}
