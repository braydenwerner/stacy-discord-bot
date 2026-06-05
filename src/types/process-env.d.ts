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
      /** SQLite file path (default: ./data/stacy.db) */
      DATABASE_PATH?: string;
      /** Discord user ID allowed to manage nice/snarky list (default: breadone) */
      STACY_OWNER_ID?: string;
      /** AWS region for Minecraft EC2 control */
      AWS_REGION?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      /** EC2 instance ID for the Minecraft server */
      MINECRAFT_INSTANCE_ID?: string;
      /** Public connect hostname (e.g. mc.motelrate.com); falls back to instance public IP */
      MINECRAFT_SERVER_HOST?: string;
      /** Minecraft port (default 25565) */
      MINECRAFT_PORT?: string;
      /** Discord channel for Minecraft backup and lifecycle notifications */
      MINECRAFT_NOTIFY_CHANNEL_ID?: string;
      /** S3 bucket for world backups (backup watcher) */
      MINECRAFT_BACKUP_BUCKET?: string;
    }
  }
}
