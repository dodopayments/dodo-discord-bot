/**
 * ThreadService - Core auto-threading logic
 * Handles thread creation, title generation, rate limiting, and edge cases
 */

import { Message, TextChannel, ThreadChannel, PermissionsBitField } from 'discord.js';
import { configStore } from './configStore.js';
import { GuildConfig } from '../types.js';

// Simple in-memory rate limit queue with exponential backoff
class RateLimitQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private retryDelay = 1000; // Start with 1 second

  async enqueue(task: () => Promise<void>): Promise<void> {
    this.queue.push(task);
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;

      try {
        await task();
        this.retryDelay = 1000; // Reset delay on success
        await this.sleep(100); // Small delay between successful tasks
      } catch (err: any) {
        console.error('Task failed:', err);

        // Check if it's a rate limit error
        if (err.code === 429 || err.status === 429) {
          const retryAfter = err.retryAfter ? err.retryAfter * 1000 : this.retryDelay;
          console.warn(`Rate limited, retrying after ${retryAfter}ms`);

          // Re-queue the task
          this.queue.unshift(task);
          await this.sleep(retryAfter);

          // Exponential backoff
          this.retryDelay = Math.min(this.retryDelay * 2, 60000);
        }
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const rateLimitQueue = new RateLimitQueue();

/**
 * Determines if a thread should be created for this message
 */
export function shouldCreateThread(message: Message, config: GuildConfig): boolean {
  // Don't create threads for messages in threads
  if (message.channel.isThread()) {
    return false;
  }

  // Check if channel is enabled
  if (!config.enabledChannels.includes(message.channelId)) {
    return false;
  }

  // Check bot message policy
  if (message.author.bot && !config.includeBots) {
    return false;
  }

  // Don't create threads for system messages
  if (message.system) {
    return false;
  }

  return true;
}

/**
 * Generate thread title from template or fallback
 */
export function generateThreadTitle(message: Message, template?: string): string {
  const author = message.author;
  const content = message.content || '';
  const first50 = content.slice(0, 50).trim() || 'New thread';
  const first100 = content.slice(0, 100).trim() || 'New thread';

  if (!template) {
    // Default fallback: "${first50}"
    return `${first50}`.slice(0, 100);
  }

  // Replace template variables
  let title = template
    .replace(/\$\{author\.username\}/g, author.username)
    .replace(/\$\{author\.displayName\}/g, author.displayName || author.username)
    .replace(/\$\{author\.tag\}/g, author.tag)
    .replace(/\$\{first50\}/g, first50)
    .replace(/\$\{first100\}/g, first100)
    .replace(/\$\{channel\.name\}/g, (message.channel as TextChannel).name || 'channel');

  // Ensure title length is within Discord limits (max 100 chars)
  return title.slice(0, 100);
}

/**
 * Create a public thread for a message
 */
export async function createThreadForMessage(message: Message): Promise<ThreadChannel | null> {
  if (!message.guild) {
    return null;
  }

  try {
    const config = await configStore.get(message.guild.id);

    if (!shouldCreateThread(message, config)) {
      return null;
    }

    // Check permissions
    const channel = message.channel as TextChannel;
    const botMember = message.guild.members.me;

    if (!botMember) {
      console.error('Bot member not found in guild');
      return null;
    }

    const permissions = channel.permissionsFor(botMember);

    if (!permissions) {
      console.error('Could not get permissions for channel');
      return null;
    }

    if (!permissions.has(PermissionsBitField.Flags.CreatePublicThreads)) {
      console.warn(`Missing CreatePublicThreads permission in channel ${channel.name}`);

      // Try to notify an admin (find first user with ManageGuild permission)
      try {
        const admins = channel.members.filter(member =>
          member.permissions.has(PermissionsBitField.Flags.ManageGuild)
        );

        if (admins.size > 0) {
          const admin = admins.first();
          await admin?.send(
            `⚠️ **Auto-Thread Permission Missing**\n\n` +
            `I don't have permission to create public threads in ${channel} (${message.guild.name}).\n\n` +
            `Please grant me the **Create Public Threads** permission.`
          ).catch(() => {
            // Ignore DM failures
          });
        }
      } catch (err) {
        // Ignore notification errors
      }

      return null;
    }

    const title = generateThreadTitle(message, config.titleTemplate);

    // Enqueue thread creation with rate limiting
    let thread: ThreadChannel | null = null;

    await rateLimitQueue.enqueue(async () => {
      thread = await message.startThread({
        name: title,
        autoArchiveDuration: config.archiveDuration,
      });

      // Send reply message if configured
      if (config.replyMessage && thread) {
        const replyText = config.replyMessage
          .replace(/\$\{author\}/g, `<@${message.author.id}>`)
          .replace(/\$\{author\.username\}/g, message.author.username);

        await thread.send(replyText).catch(err => {
          console.error('Failed to send reply message:', err);
        });
      }
    });

    return thread;
  } catch (err) {
    console.error('Failed to create thread for message:', err);
    return null;
  }
}

/**
 * Update thread title when original message is edited
 */
export async function updateThreadTitle(
  message: Message,
  thread: ThreadChannel
): Promise<void> {
  if (!message.guild) return;

  try {
    const config = await configStore.get(message.guild.id);

    // Don't update if manually renamed
    if (config.manuallyRenamedThreads.has(thread.id)) {
      return;
    }

    const newTitle = generateThreadTitle(message, config.titleTemplate);

    if (thread.name !== newTitle) {
      await rateLimitQueue.enqueue(async () => {
        await thread.setName(newTitle);
      });
    }
  } catch (err) {
    console.error('Failed to update thread title:', err);
  }
}

/**
 * Mark a thread as manually renamed
 */
export async function markThreadAsManuallyRenamed(
  guildId: string,
  threadId: string
): Promise<void> {
  try {
    const config = await configStore.get(guildId);
    config.manuallyRenamedThreads.add(threadId);
    await configStore.set(guildId, config);
  } catch (err) {
    console.error('Failed to mark thread as manually renamed:', err);
  }
}
