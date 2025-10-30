/**
 * Handler for messageUpdate events
 * Updates thread title when original message is edited (if auto-titled and not manually renamed)
 */

import { Message, PartialMessage, ThreadChannel } from 'discord.js';
import { updateThreadTitle } from '../services/threadService.js';

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  // Fetch full message if partial
  if (newMessage.partial) {
    try {
      newMessage = await newMessage.fetch();
    } catch (err) {
      console.error('Failed to fetch partial message:', err);
      return;
    }
  }

  // Ignore messages without guilds
  if (!newMessage.guild) {
    return;
  }

  // Check if message has a thread
  if (!newMessage.hasThread) {
    return;
  }

  try {
    // Fetch the thread
    const thread = newMessage.thread;
    
    if (!thread) {
      return;
    }

    // Update thread title based on new message content
    await updateThreadTitle(newMessage as Message, thread as ThreadChannel);
  } catch (err) {
    console.error('Error in messageUpdate handler:', err);
    // Don't crash - log and continue
  }
}
