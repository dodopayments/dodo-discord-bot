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
  .setDescription('Start the intro + working-on DM flow for user(s)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName('user1')
      .setDescription('First user to DM')
      .setRequired(false)
  )
  .addUserOption((opt) =>
    opt
      .setName('user2')
      .setDescription('Second user to DM')
      .setRequired(false)
  )
  .addUserOption((opt) =>
    opt
      .setName('user3')
      .setDescription('Third user to DM')
      .setRequired(false)
  )
  .addUserOption((opt) =>
    opt
      .setName('user4')
      .setDescription('Fourth user to DM')
      .setRequired(false)
  )
  .addUserOption((opt) =>
    opt
      .setName('user5')
      .setDescription('Fifth user to DM')
      .setRequired(false)
  );

export const clearDmCommand = new SlashCommandBuilder()
  .setName('clear-dm')
  .setDescription("Clear the bot's recent DMs with you")
  .setDefaultMemberPermissions(null);

export async function handlePingIntro(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targets: User[] = [];
  for (let i = 1; i <= 5; i++) {
    const user = interaction.options.getUser(`user${i}`);
    if (user) {
      targets.push(user);
    }
  }

  if (targets.length === 0) {
    targets.push(interaction.user);
  }

  const guild = interaction.guild!;

  const modRoleId = process.env.MOD_ROLE_ID;
  const hasTargetsOtherThanSelf = targets.some(user => user.id !== interaction.user.id);
  
  if (hasTargetsOtherThanSelf && modRoleId) {
    const member = interaction.member as GuildMember;
    if (!member.roles.cache.has(modRoleId)) {
      await interaction.followUp({ content: '❌ You need the moderator role to ping intro for others.', ephemeral: true });
      return;
    }
  }

  const results: string[] = [];
  
  for (const target of targets) {
    const result = await startIntroFlow(target, guild);
    if (!result) {
      results.push(`⚠️ Could not DM ${target} or the flow was cancelled. They may have DMs disabled.`);
      continue;
    }

    let threadId: string | null = null;
    try {
      threadId = await postWorkingThread(guild, target, result.project);
    } catch {}

    let roleGranted = false;
    try {
      roleGranted = await grantBuilderRole(guild, target.id);
    } catch {}

    const userResults: string[] = [`✅ Intro flow completed for ${target}.`];
    if (roleGranted) userResults.push('• Granted Dodo Builder role.');
    if (threadId) userResults.push(`• Started thread: <#${threadId}>`);
    
    results.push(userResults.join('\n'));
  }

  await interaction.followUp(results.join('\n\n'));
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
