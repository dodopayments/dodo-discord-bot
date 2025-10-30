import {
  Guild,
  TextChannel,
  User,
  ChannelType,
  ThreadAutoArchiveDuration,
  GuildMember,
} from 'discord.js';

interface IntroFlowResult {
  intro: string;
  project: string;
}

const DM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per step

export async function startIntroFlow(user: User, guild: Guild): Promise<IntroFlowResult | null> {
  const dm = await user.createDM();
  try {
    await dm.send(
      `Hey ${user.username}! Welcome to ${guild.name} 🎉\n\n` +
        `Please answer a couple of quick questions to help others get to know you.\n` +
        `You can type 'cancel' anytime to stop.`
    );

    const intro = await askQuestion(dm, `1) Tell us a bit about yourself:`);
    if (!intro) return null;

    const project = await askQuestion(dm, `2) What are you working on right now (or want to start)?`);
    if (!project) return null;

    await dm.send(
      `Awesome! Thanks. I'll share your project in the working-on channel and grant you the Dodo Builder role if configured.`
    );

    return { intro, project };
  } catch (err) {
    // DM might be disabled
    return null;
  }
}

async function askQuestion(dm: any, prompt: string): Promise<string | null> {
  await dm.send(prompt);
  try {
    const collected = await dm.awaitMessages({ max: 1, time: DM_TIMEOUT_MS, errors: ['time'] });
    const content = collected.first()?.content?.trim();
    if (!content || content.toLowerCase() === 'cancel') {
      await dm.send('Cancelled. You can restart anytime by contacting a moderator.');
      return null;
    }
    return content;
  } catch {
    await dm.send('Timed out. You can restart anytime by contacting a moderator.');
    return null;
  }
}

export async function postWorkingThread(
  guild: Guild,
  user: User,
  project: string
): Promise<string | null> {
  const workingOnChannelId = process.env.WORKING_ON_CHANNEL_ID;
  if (!workingOnChannelId) return null;

  const channel = guild.channels.cache.get(workingOnChannelId);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const text = channel as TextChannel;
  const announce = await text.send({
    content: `🔧 ${user} is working on: ${project}`,
  });

  const thread = await announce.startThread({
    name: `${user.username} • Working On`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  });

  return thread?.id ?? null;
}

export async function grantBuilderRole(guild: Guild, userId: string): Promise<boolean> {
  const roleId = process.env.DODO_BUILDER_ROLE_ID;
  if (!roleId) return false;
  try {
    const member: GuildMember = await guild.members.fetch(userId);
    await member.roles.add(roleId);
    return true;
  } catch {
    return false;
  }
}
