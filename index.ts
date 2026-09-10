/**
 * discord-intro-bot.ts
 *
 * TypeScript Discord bot that:
 * 1) On guildMemberAdd or when a mod runs /ping-intro [user], sends a public message in #introductions to the user
 * 2) The user clicks the Start Introduction button which triggers an ephemeral reply
 * 3) The ephemeral reply contains buttons to open Modals (forms) for Introduction and Projects
 * 4) When the user completes BOTH forms, they receive the "Dodo Builder" role.
 *
 * Requirements / env vars (set in your environment):
 * - DISCORD_TOKEN          = Bot token
 * - CLIENT_ID              = Application (bot) client id
 * - GUILD_ID               = Guild id where you register the command (optional but recommended)
 * - INTRO_CHANNEL_ID       = Channel id for #introductions
 * - WORKING_ON_CHANNEL_ID  = Channel id for #working-on
 * - MOD_ROLE_ID            = Role id for moderators (for command permissions)
 * - DODO_BUILDER_ROLE_ID   = Role id for "Dodo Builder" badge
 *
 * Notes:
 * - Keep Server Members Intent enabled in Developer Portal.
 * - Ensure the bot has permission to Create Public Threads, Send Messages, Manage Threads,
 *   Add Members to Threads, and Manage Roles.
 * - The bot's role must be HIGHER than the Dodo Builder role in the role hierarchy.
 */


import os from 'node:os';


// New imports for enhanced features


import { moderationService } from './src/services/moderationService.js';
import { supportBotService } from './src/services/supportBotService.js';
import { moveQuestionService } from './src/services/moveQuestionService.js';
import { botTrapService } from './src/services/botTrap.js';
import { introFlowService } from './src/services/introFlow.js';


import {
    Client,
    GatewayIntentBits,
    Partials,
    TextChannel,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    GuildMember,
    Events,
    ThreadChannel,
    EmbedBuilder,
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    INTRO_CHANNEL_ID,
    WORKING_ON_CHANNEL_ID,
    SHOWCASE_CHANNEL_ID,
    MOD_ROLE_ID,
    DODO_BUILDER_ROLE_ID,
    DELETED_MESSAGES_CHANNEL,
    BOTS_TRAP_CHANNEL,
    MEMBER_ROLE_ID,
    GENERAL_CHANNEL_ID,
    BOT_TEST_CHANNEL,
    GET_HELP_CHANNEL,
    OTHER_TAG_HELP_ID,
} = process.env as Record<string, string | undefined>;

// Validate that all required environment variables are present
if (!DISCORD_TOKEN || !GUILD_ID || !CLIENT_ID || !INTRO_CHANNEL_ID || !WORKING_ON_CHANNEL_ID || !SHOWCASE_CHANNEL_ID || !MOD_ROLE_ID || !DODO_BUILDER_ROLE_ID || !DELETED_MESSAGES_CHANNEL || !BOTS_TRAP_CHANNEL || !MEMBER_ROLE_ID || !GENERAL_CHANNEL_ID || !BOT_TEST_CHANNEL || !GET_HELP_CHANNEL || !OTHER_TAG_HELP_ID) {
    console.error('Missing one or more required env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID, INTRO_CHANNEL_ID, WORKING_ON_CHANNEL_ID, SHOWCASE_CHANNEL_ID, MOD_ROLE_ID, DODO_BUILDER_ROLE_ID, DELETED_MESSAGES_CHANNEL, BOTS_TRAP_CHANNEL, MEMBER_ROLE_ID, GENERAL_CHANNEL_ID, BOT_TEST_CHANNEL, GET_HELP_CHANNEL, OTHER_TAG_HELP_ID');
    process.exit(1);
}

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required for guildMemberAdd event
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message],
});

// Track bot start time for uptime calculation
const botStartTime = Date.now();

/**
 * Registers the slash commands with Discord
 */
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

    const commands = [
        {
            name: 'ping-intro',
            description: 'Ping user(s) to introduce themselves (mods only).',
            options: [
                {
                    name: 'user1',
                    description: 'First user to ping',
                    type: 6, // USER type
                    required: false,
                },
                {
                    name: 'user2',
                    description: 'Second user to ping',
                    type: 6, // USER type
                    required: false,
                },
                {
                    name: 'user3',
                    description: 'Third user to ping',
                    type: 6, // USER type
                    required: false,
                },
                {
                    name: 'user4',
                    description: 'Fourth user to ping',
                    type: 6, // USER type
                    required: false,
                },
                {
                    name: 'user5',
                    description: 'Fifth user to ping',
                    type: 6, // USER type
                    required: false,
                },
            ],
        },
        {
            name: 'ping',
            description: 'Check bot latency and performance metrics.',
            options: [
                {
                    name: 'ephemeral',
                    description: 'Make the response only visible to you',
                    type: 5, // BOOLEAN type
                    required: false,
                }
            ]
        },
        {
            name: 'move-message',
            description: 'Move a message to the help channel (mods only).',
            options: [
                {
                    name: 'message_id',
                    description: 'ID of the message to move (leave blank to move the last message)',
                    type: 3, // STRING type
                    required: false,
                }
            ]
        },
        {
            name: 'bot-answer',
            description: 'Directly answer a specific message without creating a thread.',
            options: [
                {
                    name: 'message_id',
                    description: 'ID of the message to answer',
                    type: 3, // STRING type
                    required: true,
                }
            ]
        },
        {
            name: 'Move Message',
            type: 3, // MESSAGE type (Message Context Menu)
        }

    ];

    try {
        const commandNames = commands.map(cmd => `/${cmd.name}`).join(', ');
        // Register commands either globally or for a specific guild
        if (GUILD_ID && client.guilds.cache.has(GUILD_ID)) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID), { body: commands });
            console.log(`Registered guild commands: ${commandNames}`);
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
            console.log(`Registered global commands: ${commandNames}`);
        }
    } catch (err) {
        console.error('Failed to register commands', err);
    }
}

// Event handler for when the bot is ready
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);

    // Initialize services
    await botTrapService.initialize(client);
    introFlowService.initialize(client);

    await registerCommands();
});

// Main interaction handler for buttons, modals, and commands
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // Handle button interactions (form selection buttons)
        if (interaction.isButton()) {
            const bi = interaction as ButtonInteraction;

            if (bi.customId === 'mark_resolved') {
                const member = bi.member as GuildMember;
                const isMod = member?.roles.cache.has(MOD_ROLE_ID!);

                let isPoster = false;
                if (bi.channel?.isThread()) {
                    const thread = bi.channel as ThreadChannel;
                    try {
                        const starterMessage = await thread.fetchStarterMessage();
                        isPoster = bi.user.id === starterMessage?.author.id;
                    } catch (e) {
                        // Fallback to ownerId if starter message is inaccessible
                        isPoster = bi.user.id === thread.ownerId;
                    }
                } else if (bi.message.reference?.messageId) {
                    try {
                        const originalMsg = await bi.channel?.messages.fetch(bi.message.reference.messageId);
                        isPoster = bi.user.id === originalMsg?.author.id;
                    } catch (e) {
                        // Ignore fetch errors
                    }
                }

                if (!isMod && !isPoster) {
                    await bi.reply({
                        content: "You're not allowed to do that. Only the person who posted the message or a moderator can mark it as resolved.",
                        ephemeral: true
                    });
                    return;
                }

                const message = bi.message;

                // Disable the button
                const newComponents = message.components.map((row: any) => {
                    return new ActionRowBuilder<ButtonBuilder>().addComponents(
                        row.components.map((component: any) => {
                            if (component.customId === 'mark_resolved') {
                                return ButtonBuilder.from(component as any).setDisabled(true);
                            }
                            return ButtonBuilder.from(component as any);
                        })
                    );
                });

                await bi.update({ components: newComponents });

                if (bi.channel && 'send' in bi.channel) {
                    await (bi.channel as TextChannel).send(`This query has been marked as resolved by <@${bi.user.id}>.`);
                }
                return;
            }

            const handled = await introFlowService.handleButton(bi);
            if (handled) return;
        }

        // Handle modal form submissions
        if (interaction.isModalSubmit()) {
            const handled = await introFlowService.handleModalSubmit(interaction);
            if (handled) return;
        }

        // Handle slash commands
        if (interaction.isCommand()) {
            const cmd = interaction;

            if (cmd.commandName === 'ping-intro') {
                await introFlowService.handlePingIntroCommand(cmd);
                return;
            }

            if (cmd.commandName === 'ping') {
                const member = cmd.member as GuildMember | null;
                if (!member) {
                    await cmd.reply({ content: 'Could not verify your membership. You cannot run this command.', ephemeral: true });
                    return;
                }

                // Check if user has moderator role
                if (!member.roles.cache.has(MOD_ROLE_ID!)) {
                    await cmd.reply({ content: 'You need the moderator role to use this command.', ephemeral: true });
                    return;
                }

                const ephemeral = cmd.isChatInputCommand() ? cmd.options.getBoolean('ephemeral') || false : false;

                // Record the time when we received the interaction
                const interactionTime = Date.now();

                // Defer reply to measure latency
                await cmd.deferReply({ ephemeral });

                // Calculate message round-trip latency from interaction creation time
                const messageLatency = Date.now() - cmd.createdTimestamp;

                // Get API latency (WebSocket heartbeat ping). Can be -1 before heartbeat is established.
                const apiLatency = client.ws.ping < 0 ? -1 : Math.round(client.ws.ping);

                // Calculate uptime
                const uptime = Date.now() - botStartTime;
                const uptimeSeconds = Math.floor(uptime / 1000);
                const uptimeMinutes = Math.floor(uptimeSeconds / 60);
                const uptimeHours = Math.floor(uptimeMinutes / 60);
                const uptimeDays = Math.floor(uptimeHours / 24);

                // Format uptime string
                let uptimeString = '';
                if (uptimeDays > 0) uptimeString += `${uptimeDays}d `;
                if (uptimeHours % 24 > 0) uptimeString += `${uptimeHours % 24}h `;
                if (uptimeMinutes % 60 > 0) uptimeString += `${uptimeMinutes % 60}m `;
                uptimeString += `${uptimeSeconds % 60}s`;

                // Determine latency status with emojis
                const getLatencyStatus = (latency: number) => {
                    if (latency < 100) return '🟢 Excellent';
                    if (latency < 200) return '🟡 Good';
                    if (latency < 300) return '🟠 Fair';
                    return '🔴 Poor';
                };

                // Additional derived metrics and values
                const totalResponseTime = Date.now() - interactionTime;
                const mem = process.memoryUsage();
                const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
                const externalMb = (('external' in mem && typeof mem.external === 'number' ? mem.external : 0) / 1024 / 1024).toFixed(1);

                // System memory (not process): used = total - free
                const sysTotalBytes = os.totalmem();
                const sysFreeBytes = os.freemem();
                const sysUsedBytes = Math.max(0, sysTotalBytes - sysFreeBytes);
                const sysUsedPct = Math.min(100, Math.max(0, Math.round((sysUsedBytes / sysTotalBytes) * 100)));
                const sysUsedMb = (sysUsedBytes / 1024 / 1024).toFixed(1);
                const sysTotalMb = (sysTotalBytes / 1024 / 1024).toFixed(1);
                const unixNow = Math.floor(Date.now() / 1000);

                const apiLatencyDisplay = apiLatency >= 0
                    ? `${apiLatency}ms ${getLatencyStatus(apiLatency)}`
                    : 'N/A';

                const pingEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('Pong! System Status')
                    .setThumbnail(cmd.user.displayAvatarURL())
                    .setDescription([
                        `Server: ${cmd.guild?.name ?? 'Direct Message'}`,
                        `Command executed by: <@${cmd.user.id}>`
                    ].join('\n'))
                    .addFields(
                        {
                            name: 'Latency Metrics',
                            value: [
                                `API Latency: ${apiLatencyDisplay}`,
                                `Message Latency: ${messageLatency}ms ${getLatencyStatus(messageLatency)}`,
                                `Total Response Time: ${totalResponseTime}ms`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: 'System Information',
                            value: [
                                `Uptime: ${uptimeString}`,
                                `Memory Usage: ${sysUsedMb}MB / ${sysTotalMb}MB (${sysUsedPct}%)`,
                                `RSS Memory: ${rssMb}MB`,
                                `External Memory: ${externalMb}MB`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: 'Bot Statistics',
                            value: [
                                `Cached Users: ${client.users.cache.size}`,
                                `Cached Guilds: ${client.guilds.cache.size}`,
                                `Node.js Version: ${process.version}`,
                                `Platform: ${process.platform} ${process.arch}`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: 'Timestamps',
                            value: [
                                `Unix Timestamp: <t:${unixNow}>`,
                                `ISO 8601: ${new Date(unixNow * 1000).toISOString()}`,
                                `Local Time: <t:${unixNow}:f>`
                            ].join('\n'),
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: `Dodo Discord Bot • Request ID: ${cmd.id}`,
                        iconURL: client.user?.displayAvatarURL()
                    });

                await cmd.editReply({ embeds: [pingEmbed] });
                return;
            }


            if (cmd.commandName === 'move-message') {
                if (!cmd.isChatInputCommand()) return;
                await moveQuestionService.handleMoveInteraction(cmd);
                return;
            }

            if (cmd.commandName === 'bot-answer') {
                if (!cmd.isChatInputCommand()) return;
                await supportBotService.handleBotAnswerInteraction(cmd);
                return;
            }

        }

        // Handle Context Menu commands
        if (interaction.isMessageContextMenuCommand()) {
            if (interaction.commandName === 'Move Message') {
                await moveQuestionService.handleMessageContextMenu(interaction);
                return;
            }
        }
    } catch (err) {
        console.error('Error in interaction handler:', err);
    }
});

// Event handler for new messages (N8N Gateway)
client.on(Events.MessageCreate, async (message) => {
    // 0. Run through honeypot bot trap service first
    const isTrap = await botTrapService.handleMessage(message);
    if (isTrap) return;

    // 1. Run through moderation service first
    const isSpam = await moderationService.handleMessage(message);
    if (isSpam) return;

    // Handle /move-message or !move-message text command
    if (message.content.trim().startsWith('/move-message') || message.content.trim().startsWith('!move-message')) {
        await moveQuestionService.handleMoveCommand(message);
        return;
    }

    // Handle /bot-answer or !bot-answer text command
    if (message.content.trim().startsWith('/bot-answer') || message.content.trim().startsWith('!bot-answer')) {
        await supportBotService.handleBotAnswerCommand(message);
        return;
    }

    // 2. Process for support bot
    await supportBotService.handleMessage(message);
});

// Event handler for when a new member joins the server
client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    if (member.user.bot) return;
    if (member.guild.id !== GUILD_ID) return;

    try {
        if (!member.pending) {
            try {
                await member.roles.add(MEMBER_ROLE_ID, 'Auto-assigned Member role on server join');
                console.log(`Successfully assigned Member role (${MEMBER_ROLE_ID}) to ${member.user.tag}`);
            } catch (roleError) {
                console.error(`Failed to assign Member role to ${member.user.tag}:`, roleError);
            }

            // Automatically trigger ping-intro flow for new users who are not pending screening
            await introFlowService.autoPingIntroForNewUser(member);
        }
    } catch (e) {
        console.error('Failed to start intro flow for new member:', e);
    }
});

// Event handler for when a member passes membership screening
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (newMember.user.bot) return;
    if (newMember.guild.id !== GUILD_ID) return;

    try {
        // Check if the user just passed membership screening
        if (oldMember.pending && !newMember.pending) {
            try {
                await newMember.roles.add(MEMBER_ROLE_ID, 'Auto-assigned Member role after screening');
                console.log(`Successfully assigned Member role (${MEMBER_ROLE_ID}) to ${newMember.user.tag} after screening`);
            } catch (roleError) {
                console.error(`Failed to assign Member role to ${newMember.user.tag}:`, roleError);
            }

            // Trigger intro flow now that member has passed screening
            await introFlowService.autoPingIntroForNewUser(newMember);
        }
    } catch (e) {
        console.error('Failed to handle GuildMemberUpdate:', e);
    }
});

// Listener for deleted messages to log them
client.on(Events.MessageDelete, async (message) => {
    await moderationService.handleDelete(message);
});



// Login to Discord with bot token
client.login(DISCORD_TOKEN).catch(err => {
    console.error('Failed to login:', err);
});