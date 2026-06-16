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
      /** Idle auto-shutdown threshold in minutes (must match EC2 host; default 30) */
      MINECRAFT_IDLE_SHUTDOWN_MINUTES?: string;
      /** Optional SSH key for EC2 logs/health when SSM is unavailable */
      MINECRAFT_SSH_KEY_PATH?: string;
      /** AWS Budget name for /cost remaining-budget display */
      AWS_BUDGET_NAME?: string;
      /** Manual monthly budget cap (USD) when no AWS Budget exists */
      AWS_MONTHLY_BUDGET_USD?: string;
      /** Promo credit pool (USD) for estimated remaining credits */
      AWS_PROMO_CREDIT_USD?: string;
      /** AWS account ID (optional; auto-detected via STS if omitted) */
      AWS_ACCOUNT_ID?: string;
      /** Start date for AWS total cost window (YYYY-MM-DD, default trailing 12 months) */
      AWS_BILLING_SINCE?: string;
    }
  }
}
