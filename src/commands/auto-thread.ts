/**
 * /auto-thread slash command
 * Provides complete configuration interface for auto-threading feature
 */

import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { configStore } from '../services/configStore.js';
import { createThreadForMessage } from '../services/threadService.js';

const VALID_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080] as const;

/**
 * Command definition for registration
 */
export const autoThreadCommand = {
  name: 'auto-thread',
  description: 'Configure auto-threading behavior',
  defaultMemberPermissions: '0x0000000000000020', // ManageGuild permission as string
  options: [
    {
      name: 'enable',
      description: 'Enable auto-threading for a channel',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'channel',
          description: 'Channel to enable auto-threading in',
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
    {
      name: 'disable',
      description: 'Disable auto-threading for a channel',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'channel',
          description: 'Channel to disable auto-threading in',
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
    {
      name: 'set',
      description: 'Configure auto-thread settings',
      type: 2, // SUB_COMMAND_GROUP
      options: [
        {
          name: 'replymessage',
          description: 'Set reply message template',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'template',
              description: 'Template with variables: ${author}, ${author.username}',
              type: 3, // STRING
              required: false,
            },
          ],
        },
        {
          name: 'titletemplate',
          description: 'Set thread title template',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'template',
              description: 'Template: ${author.username}, ${first50}, ${first100}, ${channel.name}',
              type: 3, // STRING
              required: false,
            },
          ],
        },
        {
          name: 'archiveduration',
          description: 'Set auto-archive duration',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'duration',
              description: 'Archive duration in minutes',
              type: 4, // INTEGER
              required: true,
              choices: [
                { name: '1 hour', value: 60 },
                { name: '24 hours', value: 1440 },
                { name: '3 days', value: 4320 },
                { name: '7 days', value: 10080 },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'status',
      description: 'Show current auto-thread configuration',
      type: 1, // SUB_COMMAND
    },
    {
      name: 'list',
      description: 'List all enabled channels and settings',
      type: 1, // SUB_COMMAND
    },
    {
      name: 'test',
      description: 'Create a test thread to verify permissions and config',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'channel',
          description: 'Channel to test in (must be enabled)',
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
  ],
};

/**
 * Handle /auto-thread command
 */
export async function handleAutoThreadCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Defer reply for commands that might take time
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.followUp('This command only works in servers.');
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const subcommandGroup = interaction.options.getSubcommandGroup();

  try {
    if (subcommandGroup === 'set') {
      await handleSetSubcommand(interaction, subcommand);
    } else {
      switch (subcommand) {
        case 'enable':
          await handleEnable(interaction);
          break;
        case 'disable':
          await handleDisable(interaction);
          break;
        case 'status':
          await handleStatus(interaction);
          break;
        case 'list':
          await handleList(interaction);
          break;
        case 'test':
          await handleTest(interaction);
          break;
        default:
          await interaction.followUp('Unknown subcommand.');
      }
    }
  } catch (err) {
    console.error('Error handling auto-thread command:', err);
    await interaction.followUp('❌ An error occurred while processing your command.').catch(() => { });
  }
}

async function handleEnable(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.followUp('❌ Auto-threading only works in text channels.');
    return;
  }

  const config = await configStore.get(interaction.guild!.id);

  if (config.enabledChannels.includes(channel.id)) {
    await interaction.followUp(`ℹ️ Auto-threading is already enabled in <#${channel.id}>.`);
    return;
  }

  config.enabledChannels.push(channel.id);
  await configStore.set(interaction.guild!.id, config);

  await interaction.followUp(`✅ Auto-threading enabled in <#${channel.id}>.`);
}

async function handleDisable(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);

  const config = await configStore.get(interaction.guild!.id);

  if (!config.enabledChannels.includes(channel.id)) {
    await interaction.followUp(`ℹ️ Auto-threading is not enabled in <#${channel.id}>.`);
    return;
  }

  config.enabledChannels = config.enabledChannels.filter(id => id !== channel.id);
  await configStore.set(interaction.guild!.id, config);

  await interaction.followUp(`✅ Auto-threading disabled in <#${channel.id}>.`);
}

async function handleSetSubcommand(
  interaction: ChatInputCommandInteraction,
  subcommand: string
): Promise<void> {
  const config = await configStore.get(interaction.guild!.id);

  switch (subcommand) {
    case 'replymessage': {
      const template = interaction.options.getString('template');
      config.replyMessage = template ?? undefined;
      await configStore.set(interaction.guild!.id, config);
      await interaction.followUp(
        template
          ? ` Reply message template set to:\n\`\`\`\n${template}\n\`\`\``
          : ' Reply message template cleared. '
      );
      break;
    }

    case 'titletemplate': {
      const template = interaction.options.getString('template');
      config.titleTemplate = template ?? undefined;
      await configStore.set(interaction.guild!.id, config);
      await interaction.followUp(
        template
          ? ` Title template set to:\n\`\`\`\n${template}\n\`\`\``
          : ' Title template cleared.'
      );
      break;
    }

    case 'archiveduration': {
      const duration = interaction.options.getInteger('duration', true) as 60 | 1440 | 4320 | 10080;

      if (!VALID_ARCHIVE_DURATIONS.includes(duration)) {
        await interaction.followUp(
          ' Invalid duration. Must be 60, 1440, 4320, or 10080 minutes.'
        );
        return;
      }

      config.archiveDuration = duration;
      await configStore.set(interaction.guild!.id, config);

      const durationNames: Record<number, string> = {
        60: '1 hour',
        1440: '24 hours',
        4320: '3 days',
        10080: '7 days',
      };

      await interaction.followUp(` Archive duration set to ${durationNames[duration]}.`);
      break;
    }

    default:
      await interaction.followUp('Unknown setting.');
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await configStore.get(interaction.guild!.id);

  const archiveDurationNames: Record<number, string> = {
    60: '1 hour',
    1440: '24 hours',
    4320: '3 days',
    10080: '7 days',
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Auto-Thread Configuration')
    .setDescription(`Configuration for ${interaction.guild!.name}`)
    .addFields(
      {
        name: 'Enabled Channels',
        value: config.enabledChannels.length > 0
          ? config.enabledChannels.map(id => `<#${id}>`).join(', ')
          : 'None',
        inline: false,
      },
      {
        name: 'Archive Duration',
        value: archiveDurationNames[config.archiveDuration] || 'Unknown',
        inline: true,
      },
      {
        name: 'Title Template',
        value: config.titleTemplate
          ? `\`${config.titleTemplate}\``
          : '_Default: `${first50}`_',
        inline: false,
      },
      {
        name: 'Reply Message',
        value: config.replyMessage || '_Not set_',
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await configStore.get(interaction.guild!.id);

  if (config.enabledChannels.length === 0) {
    await interaction.followUp('ℹ️ No channels have auto-threading enabled.');
    return;
  }

  const channelList = config.enabledChannels
    .map(id => {
      const channel = interaction.guild!.channels.cache.get(id);
      return channel ? `• <#${id}> (${channel.name})` : `• <#${id}> _(channel not found)_`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Auto-Thread Enabled Channels')
    .setDescription(channelList)
    .setFooter({ text: `Total: ${config.enabledChannels.length} channels` })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

async function handleTest(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;

  if (channel.type !== ChannelType.GuildText) {
    await interaction.followUp('Can only test in text channels.');
    return;
  }

  const config = await configStore.get(interaction.guild!.id);

  if (!config.enabledChannels.includes(channel.id)) {
    await interaction.followUp(
      `Auto-threading is not enabled in <#${channel.id}>.\n` +
      `Enable it first with \`/auto-thread enable\`.`
    );
    return;
  }

  // Check permissions
  const botMember = interaction.guild!.members.me;
  if (!botMember) {
    await interaction.followUp('Could not verify bot permissions.');
    return;
  }

  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(PermissionsBitField.Flags.CreatePublicThreads)) {
    await interaction.followUp(
      `Missing permission: **Create Public Threads** in <#${channel.id}>.\n` +
      `Please grant this permission to the bot.`
    );
    return;
  }

  // Create a test message
  const testMessage = await channel.send(
    '🧪 **Auto-Thread Test**\n\nThis is a test message to verify auto-threading configuration.'
  );

  // Try to create thread
  const thread = await createThreadForMessage(testMessage);

  if (thread) {
    await interaction.followUp(
      `Test successful!\n\n` +
      `Created thread: <#${thread.id}>\n` +
      `Original message: ${testMessage.url}`
    );
  } else {
    await interaction.followUp(
      `Test failed. Could not create thread.\n` +
      `Check bot permissions and configuration.`
    );
  }
}
