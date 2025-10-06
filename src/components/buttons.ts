/**
 * Button components for thread management
 * Provides Close and Rename buttons with modal interactions
 */

import {
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalActionRowComponentBuilder,
  ThreadChannel,
  PermissionsBitField,
} from 'discord.js';
import { markThreadAsManuallyRenamed } from '../services/threadService.js';

/**
 * Create action row with Close and Rename buttons
 */
export function createThreadButtons(threadId: string): ActionRowBuilder<ButtonBuilder> {
  const closeButton = new ButtonBuilder()
    .setCustomId(`thread_close|${threadId}`)
    .setLabel('Close Thread')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  const renameButton = new ButtonBuilder()
    .setCustomId(`thread_rename|${threadId}`)
    .setLabel('Rename Thread')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('✏️');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton, renameButton);
}

/**
 * Handle Close button interaction
 */
export async function handleCloseButton(interaction: ButtonInteraction): Promise<void> {
  const threadId = interaction.customId.split('|')[1];

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command only works in servers.', ephemeral: true });
    return;
  }

  try {
    const thread = await interaction.guild.channels.fetch(threadId) as ThreadChannel;

    if (!thread || !thread.isThread()) {
      await interaction.reply({ content: 'Thread not found.', ephemeral: true });
      return;
    }

    // Check permissions
    const member = interaction.member;
    if (!member) {
      await interaction.reply({ content: 'Could not verify your permissions.', ephemeral: true });
      return;
    }

    const permissions = thread.permissionsFor(member as any);
    const canManage = permissions?.has(PermissionsBitField.Flags.ManageThreads);
    const isOwner = thread.ownerId === interaction.user.id;

    if (!canManage && !isOwner) {
      await interaction.reply({
        content: 'You need Manage Threads permission or be the thread owner to close this thread.',
        ephemeral: true,
      });
      return;
    }

    // Archive (close) the thread
    await thread.setArchived(true, 'Closed via button by ' + interaction.user.tag);

    await interaction.reply({
      content: '✅ Thread has been closed.',
      ephemeral: true,
    });
  } catch (err) {
    console.error('Error handling close button:', err);
    await interaction.reply({
      content: '❌ Failed to close the thread. Please try again.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/**
 * Handle Rename button interaction
 */
export async function handleRenameButton(interaction: ButtonInteraction): Promise<void> {
  const threadId = interaction.customId.split('|')[1];

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command only works in servers.', ephemeral: true });
    return;
  }

  try {
    const thread = await interaction.guild.channels.fetch(threadId) as ThreadChannel;

    if (!thread || !thread.isThread()) {
      await interaction.reply({ content: 'Thread not found.', ephemeral: true });
      return;
    }

    // Check permissions
    const member = interaction.member;
    if (!member) {
      await interaction.reply({ content: 'Could not verify your permissions.', ephemeral: true });
      return;
    }

    const permissions = thread.permissionsFor(member as any);
    const canManage = permissions?.has(PermissionsBitField.Flags.ManageThreads);
    const isOwner = thread.ownerId === interaction.user.id;

    if (!canManage && !isOwner) {
      await interaction.reply({
        content: 'You need Manage Threads permission or be the thread owner to rename this thread.',
        ephemeral: true,
      });
      return;
    }

    // Show modal for new name
    const modal = new ModalBuilder()
      .setCustomId(`thread_rename_modal|${threadId}`)
      .setTitle('Rename Thread');

    const nameInput = new TextInputBuilder()
      .setCustomId('thread_name')
      .setLabel('New thread name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(thread.name);

    const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (err) {
    console.error('Error handling rename button:', err);
    await interaction.reply({
      content: '❌ Failed to open rename dialog. Please try again.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/**
 * Handle rename modal submission
 */
export async function handleRenameModal(interaction: any): Promise<void> {
  const threadId = interaction.customId.split('|')[1];
  const newName = interaction.fields.getTextInputValue('thread_name');

  if (!interaction.guild) {
    await interaction.reply({ content: 'This command only works in servers.', ephemeral: true });
    return;
  }

  try {
    const thread = await interaction.guild.channels.fetch(threadId) as ThreadChannel;

    if (!thread || !thread.isThread()) {
      await interaction.reply({ content: 'Thread not found.', ephemeral: true });
      return;
    }

    // Rename the thread
    await thread.setName(newName.slice(0, 100));

    // Mark as manually renamed so auto-update doesn't override
    await markThreadAsManuallyRenamed(interaction.guild.id, threadId);

    await interaction.reply({
      content: `✅ Thread renamed to "${newName.slice(0, 100)}"`,
      ephemeral: true,
    });
  } catch (err) {
    console.error('Error handling rename modal:', err);
    await interaction.reply({
      content: '❌ Failed to rename the thread. Please try again.',
      ephemeral: true,
    }).catch(() => {});
  }
}
