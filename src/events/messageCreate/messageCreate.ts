import type { CustomClient } from "@/index";
import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  RunnableWithMessageHistory,
  type RunnableConfig,
} from "@langchain/core/runnables";
import type { Message } from "discord.js";
import { OpenAI } from "langchain/llms/openai";

export default async function messageCreate(
  client: CustomClient,
  message: Message,
) {
  if (message.author.bot) return;

  console.log("messageCreate");
  console.log(message.content);

  const llm = new OpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0.8,
    maxTokens: 4000,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["ai", "You are a helpful assistant named Stacy"],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);
  const runnable = prompt.pipe(llm);

  const messageHistory = new ChatMessageHistory();

  const withHistory = new RunnableWithMessageHistory({
    runnable,
    // Optionally, you can use a function which tracks history by session ID.
    getMessageHistory: (_sessionId: string) => messageHistory,
    inputMessagesKey: "input",
    // This shows the runnable where to insert the history.
    // We set to "history" here because of our MessagesPlaceholder above.
    historyMessagesKey: "history",
  });

  // Create your `configurable` object. This is where you pass in the
  // `sessionId` which is used to identify chat sessions in your message store.
  const config: RunnableConfig = { configurable: { sessionId: "1" } };

  let output = await withHistory.invoke({ input: message.content }, config);
  console.log("output 1:", output);

  message.reply(output);
}
