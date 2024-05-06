export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string;
      GUILD_ID: string;
      TOKEN: string;
    }
  }
}
