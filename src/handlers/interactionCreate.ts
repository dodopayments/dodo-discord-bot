/**
 * Handler for all interaction events
 * Routes slash commands, buttons, and modals with proper deferred responses
 */

import { Interaction } from 'discord.js';
import { handleAutoThreadCommand } from '../commands/auto-thread.js';
import {
  handleCloseButton,
  handleRenameButton,
  handleRenameModal,
} from '../components/buttons.js';

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'auto-thread') {
        await handleAutoThreadCommand(interaction);
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith('thread_close|')) {
        await handleCloseButton(interaction);
      } else if (customId.startsWith('thread_rename|')) {
        await handleRenameButton(interaction);
      }
      return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      if (customId.startsWith('thread_rename_modal|')) {
        await handleRenameModal(interaction);
      }
      return;
    }
  } catch (err) {
    console.error('Error handling interaction:', err);

    // Try to respond with error message
    const reply = { content: '❌ An error occurred while processing your request.', ephemeral: true };

    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    } catch (replyErr) {
      console.error('Failed to send error response:', replyErr);
    }
  }
}
