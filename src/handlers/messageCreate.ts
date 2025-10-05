/**
 * Handler for messageCreate events
 * Auto-creates threads for messages in configured channels
 */

import { Message } from 'discord.js';
import { createThreadForMessage } from '../services/threadService.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore messages without a guild (DMs)
  if (!message.guild) {
    return;
  }

  // Ignore messages in threads (already in a thread)
  if (message.channel.isThread()) {
    return;
  }

  try {
    const thread = await createThreadForMessage(message);
    
    if (thread) {
      console.log(
        `Created thread "${thread.name}" (${thread.id}) ` +
        `for message ${message.id} in #${(message.channel as any).name}`
      );
    }
  } catch (err) {
    console.error('Error in messageCreate handler:', err);
    // Don't crash the bot - log and continue
  }
}
