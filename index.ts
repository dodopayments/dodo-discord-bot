/**
 * discord-intro-bot.ts
 *
 * TypeScript Discord bot that:
 * 1) On guildMemberAdd or when a mod runs /ping-intro [user], sends a DM to the user
 *    with a button to fill in their introduction or working-on information.
 * 2) When the user submits the modal, the bot posts a public message in #introductions
 *    or creates a PUBLIC thread in #working-on with their information.
 * 3) When the user completes BOTH forms, they receive the "Dodo Builder" role.
 * 4) Users can run /clear-dm to delete all DM messages from this bot.
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
 * - Users must have DMs enabled from server members for this to work.
 * - Ensure the bot has permission to Create Public Threads, Send Messages, Manage Threads,
 *   Add Members to Threads, and Manage Roles.
 * - The bot's role must be HIGHER than the Dodo Builder role in the role hierarchy.
 */


import os from 'node:os';
import {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    TextChannel,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalSubmitInteraction,
    ButtonInteraction,
    CommandInteraction,
    GuildMember,
    Events,
    ModalActionRowComponentBuilder,
    User,
    DMChannel,
    EmbedBuilder,
} from 'discord.js';

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    INTRO_CHANNEL_ID,
    WORKING_ON_CHANNEL_ID,
    MOD_ROLE_ID,
    DODO_BUILDER_ROLE_ID,
} = process.env as Record<string, string | undefined>;

// Validate that all required environment variables are present
if (!DISCORD_TOKEN || !CLIENT_ID || !INTRO_CHANNEL_ID || !WORKING_ON_CHANNEL_ID || !MOD_ROLE_ID || !DODO_BUILDER_ROLE_ID) {
    console.error('Missing one or more required env vars: DISCORD_TOKEN, CLIENT_ID, INTRO_CHANNEL_ID, WORKING_ON_CHANNEL_ID, MOD_ROLE_ID, DODO_BUILDER_ROLE_ID');
    process.exit(1);
}

// Server post: Introduction embed (uses user mention and rich layout)
function buildIntroEmbed(name: string, targetUserId: string, about: string): EmbedBuilder {
    const introVariations = [
        {
            title: `Welcome to the Dodo family, ${name}!`,
            section: `About ${name}:`,
            footer: "Ready to build something amazing? Let's go!",
        },
        {
            title: `Hey there, ${name}!`,
            section: `Get to know ${name}:`,
            footer: "Welcome to our community of builders and creators!",
        },
        {
            title: `A warm welcome to ${name}!`,
            section: `Meet ${name}:`,
            footer: "Excited to see what you'll build with us!",
        },
        {
            title: `Welcome aboard, ${name}!`,
            section: `About ${name}:`,
            footer: "Great to have another builder in our community! Let's create something awesome together!",
        },
        {
            title: `Welcome to Dodo Payments, ${name}!`,
            section: `Here's what ${name} shared:`,
            footer: "We're thrilled to have you join our journey of building great products!",
        },
    ];

    const randomIndex = Math.floor(Math.random() * introVariations.length);
    const v = introVariations[randomIndex];

    const description = [
        `${v.title} <@${targetUserId}>`,
        '',
        `__${v.section}__`,
        `> ${about}`,
    ].join('\n');

    return new EmbedBuilder()
        .setColor(0x2b6cb0)
        .setTitle('New Introduction')
        .setDescription(description)
        .setFooter({ text: v.footer });
}

// Server post: Working-on embed
function buildWorkingOnEmbed(product: string, targetUserId: string, about: string): EmbedBuilder {
    const workingVariations = [
        { title: `New project: ${product}`, section: 'About this project:', footer: 'Join the discussion here!' },
        { title: `Building: ${product}`, section: 'Project details:', footer: 'Share your thoughts in the thread!' },
        { title: `Work in progress: ${product}`, section: "What it's about:", footer: "Let's discuss this together!" },
        { title: `Project spotlight: ${product}`, section: 'Project overview:', footer: 'Join the conversation!' },
        { title: `Fresh build: ${product}`, section: 'Here are the details:', footer: 'Share your feedback here!' },
    ];

    const randomIndex = Math.floor(Math.random() * workingVariations.length);
    const v = workingVariations[randomIndex];

    const description = [
        `${v.title} <@${targetUserId}>`,
        '',
        `__${v.section}__`,
        `> ${about}`,
    ].join('\n');

    return new EmbedBuilder()
        .setColor(0x2f855a)
        .setTitle('New Project')
        .setDescription(description)
        .setFooter({ text: v.footer });
}

// Helper to build Discord channel URLs
function buildChannelUrl(guildId: string, channelId: string | undefined): string {
    return `https://discord.com/channels/${guildId}/${channelId}`;
}

// Welcome message embed builder for DMs (use full URLs so links work in DMs)
function buildWelcomeEmbed(userId: string, guildId: string): EmbedBuilder {
    const introLink = buildChannelUrl(guildId, INTRO_CHANNEL_ID);
    const workingLink = buildChannelUrl(guildId, WORKING_ON_CHANNEL_ID);
    const getHelpId = process.env.GET_HELP_CHANNEL_ID;
    const getHelpLink = getHelpId ? buildChannelUrl(guildId, getHelpId) : undefined;

    const description = [
        `Hey <@${userId}>`,
        '',
        'Welcome to **Dodo Payments** — home for builders shipping great products.',
        '',
        '__Kick things off (≈60s):__',
        `> - Fill Introduction — who you are + what you're working on.`,
        `> - Fill What You're Working On — share your current project; we'll open a public thread so others can follow and help.`,
        '',
        '__Perk:__ Complete both to earn the Dodo Builder role.',
        '',
        '__Notes__',
        '> - Your answers will be posted publicly — please avoid any sensitive info.',
        `> - Jump in anytime via [#introductions](${introLink}), [#working-on](${workingLink})${getHelpLink ? `, [#get-help](${getHelpLink})` : ''}.`,
        '',
        "Let's build great things together!"
    ].join('\n');

    return new EmbedBuilder()
        .setColor(0x2b6cb0)
        .setTitle('Welcome to Dodo Payments!')
        .setDescription(description);
}

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required for guildMemberAdd event
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // Added for DM management
    ],
    partials: [Partials.Channel, Partials.Message],
});

// Track user completions: Map<userId, Set<'intro' | 'working'>>
const userCompletions = new Map<string, Set<'intro' | 'working'>>();

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
            description: 'Ping a user to introduce themselves (mods only).',
            options: [
                {
                    name: 'user',
                    description: 'User to ping',
                    type: 6, // USER type
                    required: true,
                },
            ],
        },
        {
            name: 'clear-dm',
            description: 'Clear all DM messages from this bot for the current user.',
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
        }
    ];

    try {
        // Register commands either globally or for a specific guild
        if (GUILD_ID && client.guilds.cache.has(GUILD_ID)) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID), { body: commands });
            console.log('Registered guild commands: /ping-intro, /clear-dm, /ping');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
            console.log('Registered global commands: /ping-intro, /clear-dm, /ping');
        }
    } catch (err) {
        console.error('Failed to register commands', err);
    }
}

/**
 * Generates a random introduction message variation
 */
function generateIntroMessage(name: string, targetUserId: string, about: string): string {
    const introVariations = [
        {
            emoji: '🎉',
            title: `Welcome to the Dodo family, ${name}!`,
            section: `About ${name}:`,
            footer: 'Ready to build something amazing? Let\'s go! 🚀'
        },
        {
            emoji: '👋',
            title: `Hey there, ${name}!`,
            section: `Get to know ${name}:`,
            footer: 'Welcome to our community of builders and creators! 💪'
        },
        {
            emoji: '🌟',
            title: `A warm welcome to ${name}!`,
            section: `Meet ${name}:`,
            footer: 'Excited to see what you\'ll build with us! ✨'
        },
        {
            emoji: '🚀',
            title: `Welcome aboard, ${name}!`,
            section: `About ${name}:`,
            footer: 'Great to have another builder in our community! Let\'s create something awesome together! 🎯'
        },
        {
            emoji: '🎊',
            title: `Welcome to Dodo Payments, ${name}!`,
            section: `Here's what ${name} shared:`,
            footer: 'We\'re thrilled to have you join our journey of building great products! 🌟'
        }
    ];

    // Randomly select one variation
    const randomIndex = Math.floor(Math.random() * introVariations.length);
    const variation = introVariations[randomIndex];

    return `${variation.emoji} **${variation.title}** (<@${targetUserId}>)

**${variation.section}**
${about}

*${variation.footer}*`;
}

/**
 * Generates a random working-on message variation (combines product and about)
 */
function generateWorkingOnMessage(product: string, targetUserId: string, about: string): string {
    const workingVariations = [
        {
            emoji: '🚀',
            title: `New project: ${product}`,
            section: 'About this project:',
            footer: 'Join the discussion here! 💬'
        },
        {
            emoji: '💡',
            title: `Building: ${product}`,
            section: 'Project details:',
            footer: 'Share your thoughts in the thread! 🎯'
        },
        {
            emoji: '⚡',
            title: `Work in progress: ${product}`,
            section: 'What it\'s about:',
            footer: 'Let\'s discuss this together! 🤝'
        },
        {
            emoji: '🎯',
            title: `Project spotlight: ${product}`,
            section: 'Project overview:',
            footer: 'Join the conversation! 💭'
        },
        {
            emoji: '✨',
            title: `Fresh build: ${product}`,
            section: 'Here are the details:',
            footer: 'Share your feedback here! 🌟'
        }
    ];

    // Randomly select one variation
    const randomIndex = Math.floor(Math.random() * workingVariations.length);
    const variation = workingVariations[randomIndex];

    return `${variation.emoji} **${variation.title}** (<@${targetUserId}>)

**${variation.section}**
${about}

*${variation.footer}*`;
}

/**
 * Clears all DM messages from the bot for a specific user
 */
async function clearDMMessages(userId: string): Promise<{ success: boolean; message: string }> {
    try {
        const user = await client.users.fetch(userId);

        // Try to get existing DM channel or create a new one
        let dmChannel: DMChannel;
        try {
            dmChannel = await user.createDM();
        } catch (error) {
            return {
                success: false,
                message: 'Cannot access your DMs. Please make sure your DMs are open to server members.'
            };
        }

        // Fetch messages from the DM channel
        let messages;
        try {
            messages = await dmChannel.messages.fetch({ limit: 100 });
        } catch (error) {
            return {
                success: false,
                message: 'Failed to fetch messages from your DMs.'
            };
        }

        // Filter messages sent by the bot
        const botMessages = messages.filter(msg => msg.author.id === client.user?.id);

        if (botMessages.size === 0) {
            return {
                success: true,
                message: 'No messages from this bot were found in your DMs.'
            };
        }

        // Delete messages in batches (Discord API allows bulk deletion of messages up to 2 weeks old)
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const recentMessages = botMessages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
        const oldMessages = botMessages.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

        let deletedCount = 0;

        // Bulk delete recent messages (less than 2 weeks old)
        if (recentMessages.size > 0) {
            try {
                // DMChannel doesn't have bulkDelete, so we'll delete individually
                for (const message of recentMessages.values()) {
                    try {
                        await message.delete();
                        deletedCount++;
                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (individualError) {
                        console.warn(`Failed to delete message ${message.id}:`, individualError);
                    }
                }
            } catch (bulkError) {
                console.warn('Could not bulk delete some messages, falling back to individual deletion:', bulkError);
                // Fallback: delete messages individually
                for (const message of recentMessages.values()) {
                    try {
                        await message.delete();
                        deletedCount++;
                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (individualError) {
                        console.warn(`Failed to delete message ${message.id}:`, individualError);
                    }
                }
            }
        }

        // Delete older messages individually (more than 2 weeks old)
        if (oldMessages.size > 0) {
            for (const message of oldMessages.values()) {
                try {
                    await message.delete();
                    deletedCount++;
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn(`Failed to delete old message ${message.id}:`, error);
                }
            }
        }

        return {
            success: true,
            message: `Successfully cleared ${deletedCount} messages from this bot in your DMs.`
        };

    } catch (error) {
        console.error('Error clearing DM messages:', error);
        return {
            success: false,
            message: 'An unexpected error occurred while trying to clear your DMs. Please try again later.'
        };
    }
}

/**
 * Automatically executes the ping-intro flow for new users when they join
 */
async function autoPingIntroForNewUser(member: GuildMember) {
    try {
        console.log(`Auto-triggering ping-intro for new user: ${member.user.tag}`);
        await startIntroFlow(member.guild.id, member.id);
    } catch (e) {
        console.error('Failed to auto-ping intro for new member:', e);
    }
}

/**
 * Starts the introduction flow by sending dismissible DM messages to the user
 */
async function startIntroFlow(guildId: string, targetUserId: string) {
    try {
        // Fetch the user to send them a DM
        const user = await client.users.fetch(targetUserId);

        // Create buttons for both introduction and working-on forms
        const introButton = new ButtonBuilder()
            .setCustomId(`open_modal|intro|${targetUserId}|${guildId}|${INTRO_CHANNEL_ID}`)
            .setLabel('Fill Introduction')
            .setStyle(ButtonStyle.Primary);

        const workingButton = new ButtonBuilder()
            .setCustomId(`open_modal|working|${targetUserId}|${guildId}|${WORKING_ON_CHANNEL_ID}`)
            .setLabel("Fill What I'm Working On")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(introButton, workingButton);

        // Send welcome embed with interactive buttons in a single DM
        const welcomeEmbed = buildWelcomeEmbed(targetUserId, guildId);
        await user.send({ embeds: [welcomeEmbed], components: [row] });

    } catch (e) {
        console.error(`Failed to send DM to user ${targetUserId}:`, e);
    }
}

/**
 * Checks if a user has completed both forms and awards the Dodo Builder role if they have
 */
async function checkAndAwardBadge(userId: string, guildId: string) {
    const completions = userCompletions.get(userId);

    // Check if user has completed both intro and working forms
    if (completions && completions.has('intro') && completions.has('working')) {
        try {
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);

            // Check if they already have the role to avoid unnecessary API calls
            if (member.roles.cache.has(DODO_BUILDER_ROLE_ID!)) {
                console.log(`User ${userId} already has Dodo Builder role`);
                return;
            }

            // Award the Dodo Builder role
            await member.roles.add(DODO_BUILDER_ROLE_ID!, 'Completed both intro and working-on forms');

            // Send congratulations DM
            try {
                const user = await client.users.fetch(userId);
                await user.send({
                    content: `🎉 **Congratulations!** You've been awarded the **Dodo Builder** badge for completing your introduction and sharing what you're working on! Keep building! 🚀`
                });
            } catch (dmError) {
                console.warn(`Could not send congratulations DM to user ${userId}:`, dmError);
            }

            console.log(`✅ Awarded Dodo Builder role to user ${userId}`);
        } catch (e) {
            console.error(`Failed to award Dodo Builder role to user ${userId}:`, e);
        }
    }
}

/**
 * Handles modal submissions for both introduction and working-on forms
 */
async function handleModalSubmit(interaction: ModalSubmitInteraction) {
    const customId = interaction.customId; // e.g. submit_modal|intro|<targetId>|<guildId>|<channelId>
    if (!customId.startsWith('submit_modal|')) return;

    const parts = customId.split('|');
    if (parts.length < 5) return;
    const flowType = parts[1] as 'intro' | 'working';
    const targetUserId = parts[2];
    const guildId = parts[3];
    const channelId = parts[4];

    // Ensure only the intended user can submit the form
    if (interaction.user.id !== targetUserId) {
        await interaction.reply({ content: "You're not allowed to submit this. This prompt was for someone else.", ephemeral: true });
        return;
    }

    // Defer the reply immediately to avoid timeout and make it dismissible
    await interaction.deferReply({ ephemeral: true });

    // Track completion in memory
    if (!userCompletions.has(targetUserId)) {
        userCompletions.set(targetUserId, new Set());
    }
    userCompletions.get(targetUserId)!.add(flowType);

    try {
        if (flowType === 'intro') {
            const name = interaction.fields.getTextInputValue('name_input');
            const about = interaction.fields.getTextInputValue('about_input');

            const destChannel = await client.channels.fetch(channelId) as TextChannel | null;
            if (!destChannel) {
                await interaction.editReply({ content: 'Could not find destination channel to post your message. Contact a mod.' });
                return;
            }

            // Create and send the public introduction embed
            const introEmbed = buildIntroEmbed(name, targetUserId, about);
            await destChannel.send({ embeds: [introEmbed] });

            const completions = userCompletions.get(targetUserId);
            const hasWorking = completions?.has('working');

            // Send dismissible success message with progress info
            await interaction.editReply({
                content: hasWorking
                    ? 'Thanks — your introduction has been posted publicly in the server! ✅ You have completed both forms and will receive the Dodo Builder role shortly!'
                    : 'Thanks — your introduction has been posted publicly in the server! One more form to go to get your Dodo Builder role!'
            });

            // Check if they should get the badge
            await checkAndAwardBadge(targetUserId, guildId);
            return;
        }

        // flowType === 'working'
        const product = interaction.fields.getTextInputValue('product_name');
        const about = interaction.fields.getTextInputValue('product_about');

        const workingChannel = await client.channels.fetch(channelId) as TextChannel | null;
        if (!workingChannel) {
            await interaction.editReply({ content: 'Could not find the working-on channel to post your message. Contact a mod.' });
            return;
        }

        // Send working-on embed with product and about combined
        const workingEmbed = buildWorkingOnEmbed(product, targetUserId, about);
        const parentMsg = await workingChannel.send({ embeds: [workingEmbed] });

        // Create a PUBLIC thread from that parent message for community interaction
        const publicThread = await parentMsg.startThread({
            name: product.slice(0, 100), // Thread names are limited to 100 characters
            autoArchiveDuration: 1440, // 24 hours
        });

        // Try to add the user to the public thread so they'll receive thread notifications
        try {
            await publicThread.members.add(targetUserId);
        } catch (err) {
            console.warn('Could not add user to public thread (may be fine):', err);
        }

        const completions = userCompletions.get(targetUserId);
        const hasIntro = completions?.has('intro');

        // Send dismissible success message with progress info
        await interaction.editReply({
            content: hasIntro
                ? 'Thanks — your working-on message has been posted in a public thread! ✅ You have completed both forms and will receive the Dodo Builder role shortly!'
                : 'Thanks — your working-on message has been posted in a public thread! One more form to go to get your Dodo Builder role!'
        });

        // Check if they should get the badge
        await checkAndAwardBadge(targetUserId, guildId);
    } catch (e) {
        console.error('Failed to create public working thread or post message:', e);
        await interaction.editReply({ content: 'Something went wrong creating the public thread. Contact a mod.' });
    }
}

// Event handler for when the bot is ready
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    await registerCommands();
});

// Main interaction handler for buttons, modals, and commands
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // Handle button interactions (form selection buttons)
        if (interaction.isButton()) {
            const bi = interaction as ButtonInteraction;
            const parts = bi.customId.split('|');
            if (parts[0] === 'open_modal') {
                const flow = parts[1] as 'intro' | 'working';
                const targetUserId = parts[2];
                const guildId = parts[3];
                const channelId = parts[4];

                // Ensure only the intended user can open the modal
                if (bi.user.id !== targetUserId) {
                    await bi.reply({ content: 'Only the invited user can fill this form.', ephemeral: true });
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId(`submit_modal|${flow}|${targetUserId}|${guildId}|${channelId}`)
                    .setTitle(flow === 'intro' ? 'Introduce yourself' : "What you're working on");

                if (flow === 'intro') {
                    // Create introduction form inputs
                    const nameInput = new TextInputBuilder()
                        .setCustomId('name_input')
                        .setLabel('Name')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('How should we call you?')
                        .setMaxLength(100);

                    const aboutInput = new TextInputBuilder()
                        .setCustomId('about_input')
                        .setLabel('About me')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setPlaceholder('Tell us about yourself, your background, interests...')
                        .setMaxLength(2000);

                    const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nameInput);
                    const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(aboutInput);

                    await bi.showModal(modal.addComponents(row1, row2));
                    return;
                }

                // flow === 'working' - Create working-on form inputs
                const productNameInput = new TextInputBuilder()
                    .setCustomId('product_name')
                    .setLabel("Product's name")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('The product name')
                    .setMaxLength(100);

                const productAboutInput = new TextInputBuilder()
                    .setCustomId('product_about')
                    .setLabel('What is it about')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Describe the product in a few lines...')
                    .setMaxLength(2000);

                const prow1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(productNameInput);
                const prow2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(productAboutInput);

                await bi.showModal(modal.addComponents(prow1, prow2));
                return;
            }
        }

        // Handle modal form submissions
        if (interaction.isModalSubmit()) {
            const ms = interaction as ModalSubmitInteraction;
            if (ms.customId.startsWith('submit_modal|')) {
                await handleModalSubmit(ms);
                return;
            }
        }

        // Handle slash commands
        if (interaction.isCommand()) {
            const cmd = interaction as CommandInteraction;

            if (cmd.commandName === 'ping-intro') {
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

                const target = (cmd as any).options.getUser('user', true);
                await cmd.reply({ content: `Starting intro flow for <@${target.id}>... (sending them a DM)`, ephemeral: true });

                // Start the introduction flow for the target user
                await startIntroFlow(cmd.guildId || GUILD_ID!, target.id);
                return;
            }

            if (cmd.commandName === 'clear-dm') {
                // Defer the reply as this operation might take some time
                await cmd.deferReply({ ephemeral: true });

                const result = await clearDMMessages(cmd.user.id);

                await cmd.editReply({
                    content: result.message
                });
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

                const ephemeral = (cmd as any).options.getBoolean('ephemeral') || false;
                
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
                const externalMb = (((mem as any).external || 0) / 1024 / 1024).toFixed(1);

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
        }
    } catch (err) {
        console.error('Error handling interaction:', err);
    }
});

// Event handler for when a new member joins the server
client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    try {
        // Automatically trigger ping-intro flow for new users
        await autoPingIntroForNewUser(member);
    } catch (e) {
        console.error('Failed to start intro flow for new member:', e);
    }
});

// Login to Discord with bot token
client.login(DISCORD_TOKEN).catch(err => {
    console.error('Failed to login:', err);
});