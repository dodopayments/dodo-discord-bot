/**
 * Handler for messageDelete events
 * Logs when a message with a thread is deleted but preserves the thread
 */

import { Message, PartialMessage } from 'discord.js';

export async function handleMessageDelete(
  message: Message | PartialMessage
): Promise<void> {
  // Ignore messages without guilds
  if (!message.guild) {
    return;
  }

  // Check if message had a thread
  if (!message.hasThread) {
    return;
  }

  try {
    const thread = message.thread;
    
    if (thread) {
      console.log(
        `Original message ${message.id} was deleted, ` +
        `but thread "${thread.name}" (${thread.id}) is preserved.`
      );
      
      // Optional: Send a notification in the thread
      await thread.send(
        '📌 *Note: The original message for this thread was deleted, but the discussion continues here.*'
      ).catch(err => {
        console.warn('Failed to send deletion notice in thread:', err);
      });
    }
  } catch (err) {
    console.error('Error in messageDelete handler:', err);
    // Don't crash - log and continue
  }
}
