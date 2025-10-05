/**
 * ConfigStore - Persistent per-guild configuration storage
 * Uses JSON files in configs/<guildId>.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { GuildConfig, ConfigStore } from '../types.js';

const CONFIG_DIR = path.join(process.cwd(), 'configs');

// Default configuration for new guilds
const DEFAULT_CONFIG: Omit<GuildConfig, 'guildId'> = {
  enabledChannels: [],
  includeBots: false,
  archiveDuration: 1440, // 24 hours
  manuallyRenamedThreads: new Set(),
};

class FileConfigStore implements ConfigStore {
  private cache: Map<string, GuildConfig> = new Map();

  constructor() {
    this.ensureConfigDir();
  }

  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (err) {
      console.error('Failed to create config directory:', err);
    }
  }

  private getConfigPath(guildId: string): string {
    return path.join(CONFIG_DIR, `${guildId}.json`);
  }

  async get(guildId: string): Promise<GuildConfig> {
    // Check cache first
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId)!;
    }

    const configPath = this.getConfigPath(guildId);

    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert manuallyRenamedThreads from array to Set
      const config: GuildConfig = {
        ...parsed,
        manuallyRenamedThreads: new Set(parsed.manuallyRenamedThreads || []),
      };

      this.cache.set(guildId, config);
      return config;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Config doesn't exist, return default
        const config: GuildConfig = {
          guildId,
          ...DEFAULT_CONFIG,
        };
        this.cache.set(guildId, config);
        return config;
      }
      console.error(`Failed to read config for guild ${guildId}:`, err);
      throw err;
    }
  }

  async set(guildId: string, config: GuildConfig): Promise<void> {
    const configPath = this.getConfigPath(guildId);

    try {
      // Convert Set to array for JSON serialization
      const serializable = {
        ...config,
        manuallyRenamedThreads: Array.from(config.manuallyRenamedThreads),
      };

      await fs.writeFile(configPath, JSON.stringify(serializable, null, 2), 'utf-8');
      this.cache.set(guildId, config);
    } catch (err) {
      console.error(`Failed to write config for guild ${guildId}:`, err);
      throw err;
    }
  }

  async update(guildId: string, partial: Partial<GuildConfig>): Promise<void> {
    const current = await this.get(guildId);
    const updated: GuildConfig = { ...current, ...partial };
    await this.set(guildId, updated);
  }
}

export const configStore = new FileConfigStore();
