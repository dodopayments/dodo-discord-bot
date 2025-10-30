/**
 * Handler for all interaction events
 * Routes slash commands, buttons, and modals with proper deferred responses
 */

import os from 'node:os';
import { Interaction, EmbedBuilder } from 'discord.js';
import { handleAutoThreadCommand } from '../commands/auto-thread.js';
import { handlePingIntro, handleClearDm } from '../commands/intro.js';
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
      } else if (interaction.commandName === 'ping-intro') {
        await handlePingIntro(interaction);
      } else if (interaction.commandName === 'clear-dm') {
        await handleClearDm(interaction);
      } else if (interaction.commandName === 'ping') {
        const interactionTime = Date.now();
        const ephemeral = true;
        await interaction.deferReply({ ephemeral });

        const messageLatency = Date.now() - interaction.createdTimestamp;
        const apiLatency = interaction.client.ws.ping < 0 ? -1 : Math.round(interaction.client.ws.ping);

        // Uptime
        const uptimeMs = Math.floor(process.uptime() * 1000);
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDays = Math.floor(uptimeHours / 24);
        let uptimeString = '';
        if (uptimeDays > 0) uptimeString += `${uptimeDays}d `;
        if (uptimeHours % 24 > 0) uptimeString += `${uptimeHours % 24}h `;
        if (uptimeMinutes % 60 > 0) uptimeString += `${uptimeMinutes % 60}m `;
        uptimeString += `${uptimeSeconds % 60}s`;

        const getLatencyStatus = (latency: number) => {
          if (latency < 0) return 'N/A';
          if (latency < 100) return '🟢 Excellent';
          if (latency < 200) return '🟡 Good';
          if (latency < 300) return '🟠 Fair';
          return '🔴 Poor';
        };

        const totalResponseTime = Date.now() - interactionTime;
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        const externalMb = ((('external' in mem && typeof (mem as any).external === 'number' ? (mem as any).external : 0) / 1024 / 1024)).toFixed(1);

        const sysTotalBytes = os.totalmem();
        const sysFreeBytes = os.freemem();
        const sysUsedBytes = Math.max(0, sysTotalBytes - sysFreeBytes);
        const sysUsedPct = Math.min(100, Math.max(0, Math.round((sysUsedBytes / sysTotalBytes) * 100)));
        const sysUsedMb = (sysUsedBytes / 1024 / 1024).toFixed(1);
        const sysTotalMb = (sysTotalBytes / 1024 / 1024).toFixed(1);
        const unixNow = Math.floor(Date.now() / 1000);

        const apiLatencyDisplay = apiLatency >= 0 ? `${apiLatency}ms ${getLatencyStatus(apiLatency)}` : 'N/A';

        const pingEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('Pong! System Status')
          .setThumbnail(interaction.user.displayAvatarURL())
          .setDescription([
            `Server: ${interaction.guild?.name ?? 'Direct Message'}`,
            `Command executed by: <@${interaction.user.id}>`
          ].join('\n'))
          .addFields(
            {
              name: 'Latency Metrics',
              value: [
                `API Latency: ${apiLatencyDisplay}`,
                `Message Latency: ${messageLatency}ms ${getLatencyStatus(messageLatency)}`,
                `Total Response Time: ${totalResponseTime}ms`,
              ].join('\n'),
              inline: false,
            },
            {
              name: 'System Information',
              value: [
                `Uptime: ${uptimeString}`,
                `Memory Usage: ${sysUsedMb}MB / ${sysTotalMb}MB (${sysUsedPct}%)`,
                `RSS Memory: ${rssMb}MB`,
                `External Memory: ${externalMb}MB`,
              ].join('\n'),
              inline: false,
            },
            {
              name: 'Bot Statistics',
              value: [
                `Cached Users: ${interaction.client.users.cache.size}`,
                `Cached Guilds: ${interaction.client.guilds.cache.size}`,
                `Node.js Version: ${process.version}`,
                `Platform: ${process.platform} ${process.arch}`,
              ].join('\n'),
              inline: false,
            },
            {
              name: 'Timestamps',
              value: [
                `Unix Timestamp: <t:${unixNow}>`,
                `ISO 8601: ${new Date(unixNow * 1000).toISOString()}`,
                `Local Time: <t:${unixNow}:f>`,
              ].join('\n'),
              inline: false,
            }
          )
          .setTimestamp()
          .setFooter({
            text: `Dodo Discord Bot • Request ID: ${interaction.id}`,
            iconURL: interaction.client.user?.displayAvatarURL()
          });

        await interaction.editReply({ embeds: [pingEmbed] });
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
