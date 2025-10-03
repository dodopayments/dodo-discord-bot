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
        }
    ];

    try {
        // Register commands either globally or for a specific guild
        if (GUILD_ID && client.guilds.cache.has(GUILD_ID)) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID), { body: commands });
            console.log('Registered guild commands: /ping-intro, /clear-dm');
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
            console.log('Registered global commands: /ping-intro, /clear-dm');
        }
    } catch (err) {
        console.error('Failed to register commands', err);
    }
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
                await dmChannel.bulkDelete(recentMessages, true);
                deletedCount += recentMessages.size;
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
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(introButton, workingButton);

        // Send welcome message with role incentive information
        await user.send({
            content: `Hello @${user.username} 👋\nWelcome to the Dodo Payments server!\n\n**Please introduce yourself:**\nClick the "Fill Introduction" button to tell us about yourself.\n\n**Share what you're working on:**\nClick the "Fill What I'm Working On" button to share your project. After you submit, we'll create a public thread for others to discuss your work.\n\n🎁 **Complete both forms to receive the "Dodo Builder" role!**\n\n**Note:** Do not enter any sensitive information in the above questions since the content will be public.`
        });

        // Send the interactive buttons for form selection
        await user.send({
            content: 'Choose which form to fill out (you can dismiss these messages):',
            components: [row]
        });

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

            // Create and send the public introduction message
            const publicMessage = `**Welcome ${name} (<@${targetUserId}>)!**

**About me:**
${about}`;

            await destChannel.send({ content: publicMessage });

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

        // Send parent message in the working-on channel
        const parentMsg = await workingChannel.send({ content: `**${product}**\n<@${targetUserId}>` });

        // Create a PUBLIC thread from that parent message
        const publicThread = await parentMsg.startThread({
            name: product.slice(0, 100), // Thread names are limited to 100 characters
            autoArchiveDuration: 1440, // 24 hours
        });

        // Post the 'about' as the first message inside the thread
        await publicThread.send({ content: about });

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

                const target = cmd.options.getUser('user', true);
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