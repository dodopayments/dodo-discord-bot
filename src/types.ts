/**
 * Type definitions for the auto-threading bot
 */

export interface GuildConfig {
  guildId: string;
  enabledChannels: string[]; // Channel IDs where auto-threading is enabled
  includeBots: boolean; // Whether to create threads for bot messages
  titleTemplate?: string; // Template for thread titles, e.g., "${author.username} • ${first50}"
  replyMessage?: string; // Template for reply message with variables
  archiveDuration: 60 | 1440 | 4320 | 10080; // Archive duration in minutes (1h, 24h, 3d, 7d)
  manuallyRenamedThreads: Set<string>; // Thread IDs that were manually renamed (don't auto-update)
}

export interface ThreadMetadata {
  threadId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  createdAt: number;
  autoTitled: boolean; // Whether the thread was auto-titled
  manuallyRenamed: boolean; // Whether the thread was manually renamed
}

export interface ConfigStore {
  get(guildId: string): Promise<GuildConfig>;
  set(guildId: string, config: GuildConfig): Promise<void>;
  update(guildId: string, partial: Partial<GuildConfig>): Promise<void>;
}

export interface RateLimitQueue {
  enqueue(task: () => Promise<void>): Promise<void>;
}
