export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string;
      GUILD_ID: string;
      TOKEN: string;
      OPENAI_API_KEY: string;
      OPENAI_ORG_ID: string;
      DEBUG_ENABLED: string;
      TAVILY_API_KEY?: string;
      CURSOR_API_KEY?: string;
      GITHUB_TOKEN?: string;
      YOUTUBE_COOKIE?: string;
    }
  }
}
