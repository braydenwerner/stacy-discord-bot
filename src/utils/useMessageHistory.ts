import { BaseChatMessageHistory } from "@langchain/core/dist/chat_history";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  RunnableConfig,
  RunnableWithMessageHistory,
} from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { ChatMessageHistory } from "langchain/memory";

export const llm = new ChatOpenAI({
  modelName: "gpt-3.5-turbo",
  temperature: 0.8,
  maxTokens: 4000,
});

export const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a helpful assistant named Stacy. Act sassy and flirty. answer:",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{input}"],
]);
const runnable = prompt.pipe(llm);

const messageHistory = new ChatMessageHistory();
export const withHistory = new RunnableWithMessageHistory({
  runnable,
  // Optionally, you can use a function which tracks history by session ID.
  getMessageHistory: async (_sessionId: string) => {
    return messageHistory as unknown as BaseChatMessageHistory;
  },
  inputMessagesKey: "input",
  historyMessagesKey: "history",
});

export const config: RunnableConfig = { configurable: { sessionId: "1" } };
