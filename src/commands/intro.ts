import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  User,
} from 'discord.js';
import { grantBuilderRole, postWorkingThread, startIntroFlow } from '../features/intro.js';

export const pingIntroCommand = new SlashCommandBuilder()
  .setName('ping-intro')
  .setDescription('Start the intro + working-on DM flow for a user')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName('user')
      .setDescription('User to DM (defaults to yourself)')
      .setRequired(false)
  );

export const clearDmCommand = new SlashCommandBuilder()
  .setName('clear-dm')
  .setDescription("Clear the bot's recent DMs with you")
  .setDefaultMemberPermissions(null);

export async function handlePingIntro(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user') ?? interaction.user;
  const guild = interaction.guild!;

  // Optional mod role gate
  const modRoleId = process.env.MOD_ROLE_ID;
  if (interaction.user.id !== target.id && modRoleId) {
    const member = interaction.member as GuildMember;
    if (!member.roles.cache.has(modRoleId)) {
      await interaction.followUp({ content: '❌ You need the moderator role to ping intro for others.', ephemeral: true });
      return;
    }
  }

  const result = await startIntroFlow(target, guild);
  if (!result) {
    await interaction.followUp('⚠️ Could not DM the user or the flow was cancelled. They may have DMs disabled.');
    return;
  }

  // Post working thread (optional)
  let threadId: string | null = null;
  try {
    threadId = await postWorkingThread(guild, target, result.project);
  } catch {}

  // Grant role (optional)
  let roleGranted = false;
  try {
    roleGranted = await grantBuilderRole(guild, target.id);
  } catch {}

  await interaction.followUp(
    [
      `✅ Intro flow completed for ${target}.`,
      roleGranted ? '• Granted Dodo Builder role.' : '• Could not grant role or not configured.',
      threadId ? `• Started thread: <#${threadId}>` : '• Could not start thread or not configured.',
    ].join('\n')
  );
}

export async function handleClearDm(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const dm = await interaction.user.createDM();
    const msgs = await dm.messages.fetch({ limit: 50 });
    const botMsgs = msgs.filter((m) => m.author.id === interaction.client.user!.id);
    await Promise.allSettled(botMsgs.map((m) => m.delete().catch(() => {})));
    await interaction.followUp('🧹 Cleared my recent DM messages with you.');
  } catch {
    await interaction.followUp('⚠️ Could not access your DMs. Make sure DMs from server members are enabled.');
  }
}
