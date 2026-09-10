import {
    Client,
    TextChannel,
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
    ModalActionRowComponentBuilder,
    Message,
    EmbedBuilder,
} from 'discord.js';
import dotenv from 'dotenv';
import { DURATION, LIMITS } from '../utils/constants.js';

dotenv.config();

const {
    GUILD_ID,
    INTRO_CHANNEL_ID,
    WORKING_ON_CHANNEL_ID,
    SHOWCASE_CHANNEL_ID,
    MOD_ROLE_ID,
    DODO_BUILDER_ROLE_ID,
} = process.env as Record<string, string | undefined>;

class IntroFlowService {
    private client: Client | null = null;

    // Track user completions: Map<userId, { completions: Set<'intro' | 'working' | 'showcase'>, timestamp: number }>
    private userCompletions = new Map<string, { completions: Set<'intro' | 'working' | 'showcase'>; timestamp: number }>();

    // Track active welcome messages: Map<userId, { messageId: string, channelId: string, timestamp: number }>
    private activeWelcomeMessages = new Map<string, { messageId: string; channelId: string; timestamp: number }>();

    private welcomeCleanupInterval: NodeJS.Timeout | null = null;
    private userCompletionsCleanupInterval: NodeJS.Timeout | null = null;

    private get welcomeMessageTTL(): number {
        return DURATION.WELCOME_MESSAGE_DELETE_DELAY_MINUTES * 60 * 1000;
    }

    /**
     * Initializes the intro flow service and its background cleanup intervals
     */
    public initialize(client: Client): void {
        this.client = client;
        this.startWelcomeMessageCleanup();
        this.startUserCompletionsCleanup();
    }

    /**
     * Stops all active cleanup intervals (useful during shutdown or tests)
     */
    public stopCleanup(): void {
        if (this.welcomeCleanupInterval) {
            clearInterval(this.welcomeCleanupInterval);
            this.welcomeCleanupInterval = null;
        }
        if (this.userCompletionsCleanupInterval) {
            clearInterval(this.userCompletionsCleanupInterval);
            this.userCompletionsCleanupInterval = null;
        }
    }

    /**
     * Server post: Introduction embed (uses user mention and rich layout)
     */
    public buildIntroEmbed(name: string, targetUserId: string, about: string): EmbedBuilder {
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
            `__**${v.section}**__`,
            `> ${about}`,
        ].join('\n');

        return new EmbedBuilder()
            .setColor(0x2b6cb0)
            .setTitle('New Introduction')
            .setDescription(description)
            .setFooter({ text: v.footer });
    }

    /**
     * Server post: Working-on embed
     */
    public buildWorkingOnEmbed(product: string, targetUserId: string, about: string): EmbedBuilder {
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

    /**
     * Server post: Showcase embed
     */
    public buildShowcaseEmbed(product: string, targetUserId: string, about: string): EmbedBuilder {
        const showcaseVariations = [
            { title: `Showcase: ${product}`, section: 'What I built:', footer: 'Check it out!' },
            { title: `Deployed: ${product}`, section: 'Project details:', footer: 'Share your feedback!' },
            { title: `Live Project: ${product}`, section: "What it does:", footer: "Let's discuss!" },
            { title: `Showcasing: ${product}`, section: 'About the project:', footer: 'Amazing work!' },
            { title: `Launched: ${product}`, section: 'Here is what it is:', footer: 'Congrats on the launch!' },
        ];

        const randomIndex = Math.floor(Math.random() * showcaseVariations.length);
        const v = showcaseVariations[randomIndex];

        const description = [
            `${v.title} <@${targetUserId}>`,
            '',
            `__${v.section}__`,
            `> ${about}`,
        ].join('\n');

        return new EmbedBuilder()
            .setColor(0x805ad5)
            .setTitle('Project Showcase')
            .setDescription(description)
            .setFooter({ text: v.footer });
    }

    /**
     * Welcome message embed builder for intro flow
     */
    public buildWelcomeEmbed(userId: string): EmbedBuilder {
        const description = [
            `Hey <@${userId}> 👋`,
            '',
            "Welcome to **Dodo Payments**! We're a community of builders shipping great products, and we're stoked to have you here.",
            '',
            '**🚀 Get Started in 60 Seconds**',
            '',
            "We'd love to know who you are and what you're building. Use the buttons below to:",
            '',
            '1.  **Introduce Yourself** - Tell us a bit about you.',
            "2.  **Share Your Project** - Show us what you're working on OR showcase a finished project! We'll create a dedicated thread for your project so others can follow along and support you.",
            '',
            '🏆 **Pro Tip:** Complete the introduction and ONE of the project forms (Working On or Showcase) to instantly earn the **Dodo Builder** role!',
            '',
            `*Note: Your answers will be posted publicly in #introductions, #working-on, or the showcase channel.*`,
            '',
            "Let's build something amazing together! 🚀"
        ].join('\n');

        return new EmbedBuilder()
            .setColor(0x2b6cb0)
            .setTitle('Welcome to Dodo Payments!')
            .setDescription(description);
    }

    /**
     * Automatically executes the ping-intro flow for new users when they join (after a delay to prevent raid spam)
     */
    public async autoPingIntroForNewUser(member: GuildMember): Promise<void> {
        try {
            if (!this.client) {
                this.client = member.client;
            }

            console.log(`Scheduling intro ping for new user: ${member.user.tag} (delayed by ${DURATION.WELCOME_DELAY_MS / 1000}s)`);

            setTimeout(async () => {
                try {
                    // Verify member is still in the guild and not removed by moderation/bot-trap
                    const currentMember = await member.guild.members.fetch(member.id).catch(() => null);
                    if (!currentMember) {
                        console.log(`User ${member.user.tag} (${member.id}) left or was removed before intro ping; skipping.`);
                        return;
                    }

                    // If still pending membership screening, do not ping yet
                    if (currentMember.pending) {
                        return;
                    }

                    await this.startIntroFlow(member.guild.id, member.id);
                } catch (innerError) {
                    console.error('Failed to execute delayed intro flow:', innerError);
                }
            }, DURATION.WELCOME_DELAY_MS);

        } catch (e) {
            console.error('Failed to schedule auto-ping intro for new member:', e);
        }
    }

    /**
     * Starts the introduction flow by posting a public message in the introductions channel with a Start button
     */
    public async startIntroFlow(guildId: string, targetUserId: string): Promise<void> {
        if (!this.client) {
            console.error('[IntroFlowService] Client not initialized');
            return;
        }

        try {
            const guild = await this.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                console.error(`[IntroFlowService] Guild ${guildId} not found`);
                return;
            }

            const channel = await guild.channels.fetch(INTRO_CHANNEL_ID!).catch(() => null);
            if (!channel || !channel.isTextBased() || !('send' in channel)) {
                console.error(`[IntroFlowService] INTRO_CHANNEL_ID (${INTRO_CHANNEL_ID}) is not a valid text-based channel`);
                return;
            }

            // If a welcome message is already active for this user, delete it first
            if (this.activeWelcomeMessages.has(targetUserId)) {
                await this.deleteWelcomeMessageForUser(guildId, targetUserId);
            }

            const startButton = new ButtonBuilder()
                .setCustomId(`start_intro_flow|${targetUserId}|${guildId}`)
                .setLabel('Start Introduction')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);

            const msg = await (channel as TextChannel).send({
                content: `Welcome <@${targetUserId}>! 👋 Click the button below to introduce yourself and get your Dodo Builder role.`,
                components: [row]
            });

            this.activeWelcomeMessages.set(targetUserId, {
                messageId: msg.id,
                channelId: channel.id,
                timestamp: Date.now(),
            });

        } catch (e) {
            console.error(`[IntroFlowService] Failed to send intro ping for user ${targetUserId}:`, e);
        }
    }

    /**
     * Helper to check if a message has the Start Introduction button component
     */
    public hasIntroButton(msg: Message, targetUserId?: string): boolean {
        if (!msg.components || !Array.isArray(msg.components)) return false;
        for (const row of msg.components) {
            if ('components' in row && Array.isArray(row.components)) {
                for (const c of row.components) {
                    const customId = 'customId' in c ? c.customId : undefined;
                    if (typeof customId === 'string') {
                        if (targetUserId) {
                            if (customId.startsWith(`start_intro_flow|${targetUserId}|`)) {
                                return true;
                            }
                        } else if (customId.startsWith('start_intro_flow|')) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * Deletes the welcome message for a specific user from the introductions channel
     */
    public async deleteWelcomeMessageForUser(guildId: string, targetUserId: string): Promise<void> {
        if (!this.client) return;

        try {
            // 1. Check in-memory active welcome messages map first
            const active = this.activeWelcomeMessages.get(targetUserId);
            if (active) {
                this.activeWelcomeMessages.delete(targetUserId);

                try {
                    const channel = await this.client.channels.fetch(active.channelId).catch(() => null);
                    if (channel && channel.isTextBased() && 'messages' in channel) {
                        const msg = await (channel as TextChannel).messages.fetch(active.messageId).catch(() => null);
                        if (msg) {
                            await msg.delete().catch(() => { });
                            console.log(`[Welcome] Deleted active welcome message for user ${targetUserId} (${active.messageId})`);
                            return;
                        }
                    }
                } catch (err) {
                    console.warn(`[Welcome] Failed to delete active welcome message from map for user ${targetUserId}:`, err);
                }
            }

            // 2. Fallback: Search in INTRO_CHANNEL_ID (useful across bot restarts)
            if (!INTRO_CHANNEL_ID) return;
            const guild = await this.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return;

            const channel = await guild.channels.fetch(INTRO_CHANNEL_ID).catch(() => null);
            if (!channel || !channel.isTextBased() || !('messages' in channel)) return;

            const messages = await (channel as TextChannel).messages.fetch({ limit: LIMITS.WELCOME_MESSAGE_FETCH_LIMIT }).catch(() => null);
            if (!messages) return;

            for (const [, msg] of messages) {
                if (msg.author.id === this.client.user?.id) {
                    // Safety guard: Never delete embed messages (member introductions are embeds!)
                    if (msg.embeds.length > 0) continue;

                    if (this.hasIntroButton(msg, targetUserId)) {
                        await msg.delete().catch(err => console.warn(`[Welcome] Could not delete found welcome message:`, err));
                        console.log(`[Welcome] Deleted welcome message for user ${targetUserId} found in channel (${msg.id})`);
                        this.activeWelcomeMessages.delete(targetUserId);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error(`[Welcome] Error while deleting welcome message for user ${targetUserId}:`, e);
        }
    }

    /**
     * Cleans up old welcome messages in the introductions channel (older than configured TTL)
     */
    public async cleanupOldWelcomeMessages(): Promise<void> {
        if (!this.client || !GUILD_ID || !INTRO_CHANNEL_ID) return;

        try {
            const now = Date.now();

            // 1. Direct cleanup of tracked active welcome messages that expired
            for (const [uid, active] of this.activeWelcomeMessages.entries()) {
                if (now - active.timestamp > this.welcomeMessageTTL) {
                    this.activeWelcomeMessages.delete(uid);
                    try {
                        const channel = await this.client.channels.fetch(active.channelId).catch(() => null);
                        if (channel && channel.isTextBased() && 'messages' in channel) {
                            const msg = await (channel as TextChannel).messages.fetch(active.messageId).catch(() => null);
                            if (msg && msg.embeds.length === 0 && this.hasIntroButton(msg)) {
                                await msg.delete().catch(() => { });
                                console.log(`[Cleanup] Deleted expired active welcome message for user ${uid} (${msg.id})`);
                            }
                        }
                    } catch (delErr) {
                        console.warn(`[Cleanup] Failed to delete active welcome message for user ${uid}:`, delErr);
                    }
                }
            }

            // 2. Fallback channel sweep for welcome messages (check last n messages max defined in constants)
            const guild = await this.client.guilds.fetch(GUILD_ID).catch(() => null);
            if (!guild) return;

            const channel = await guild.channels.fetch(INTRO_CHANNEL_ID).catch(() => null);
            if (!channel || !channel.isTextBased() || !('messages' in channel)) return;

            const messages = await (channel as TextChannel).messages.fetch({ limit: LIMITS.WELCOME_MESSAGE_FETCH_LIMIT }).catch(() => null);
            if (!messages) return;

            for (const [, msg] of messages) {
                if (msg.author.id === this.client.user?.id) {
                    // Safety guard: Never delete embed messages (member introductions are embeds!)
                    if (msg.embeds.length > 0) continue;

                    // Check if it's a welcome message via button customId
                    if (this.hasIntroButton(msg)) {
                        if (now - msg.createdTimestamp > this.welcomeMessageTTL) {
                            try {
                                await msg.delete().catch(() => { });
                                console.log(`[Cleanup] Deleted old welcome message ${msg.id} (age: ${Math.round((now - msg.createdTimestamp) / 1000)}s)`);

                                for (const [uid, active] of this.activeWelcomeMessages.entries()) {
                                    if (active.messageId === msg.id) {
                                        this.activeWelcomeMessages.delete(uid);
                                    }
                                }
                            } catch (delError) {
                                console.warn(`[Cleanup] Failed to delete welcome message ${msg.id}:`, delError);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error during welcome message cleanup:', e);
        }
    }

    /**
     * Starts background interval to clean up old welcome messages in introductions channel
     */
    private startWelcomeMessageCleanup(): void {
        this.cleanupOldWelcomeMessages().catch(err => {
            console.error('Initial welcome message cleanup failed:', err);
        });

        if (this.welcomeCleanupInterval) {
            clearInterval(this.welcomeCleanupInterval);
        }

        this.welcomeCleanupInterval = setInterval(async () => {
            await this.cleanupOldWelcomeMessages();
        }, 60 * 1000);
    }

    /**
     * Cleans up user completions in memory that are older than 24 hours
     */
    private startUserCompletionsCleanup(): void {
        const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
        const TTL = 24 * 60 * 60 * 1000; // 24 hours

        if (this.userCompletionsCleanupInterval) {
            clearInterval(this.userCompletionsCleanupInterval);
        }

        this.userCompletionsCleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [userId, data] of this.userCompletions.entries()) {
                if (now - data.timestamp > TTL) {
                    this.userCompletions.delete(userId);
                }
            }
        }, CLEANUP_INTERVAL);
    }

    /**
     * Checks if a user has completed both forms and awards the Dodo Builder role if they have
     */
    public async checkAndAwardBadge(userId: string, guildId: string): Promise<void> {
        if (!this.client) return;

        const userData = this.userCompletions.get(userId);
        const hasIntro = userData && userData.completions.has('intro');
        const hasProject = userData && (userData.completions.has('working') || userData.completions.has('showcase'));
        const completed = hasIntro && hasProject;

        if (completed) {
            // Also ensure any leftover welcome message is deleted
            await this.deleteWelcomeMessageForUser(guildId, userId);

            try {
                const guild = await this.client.guilds.fetch(guildId).catch(() => null);
                if (!guild) {
                    console.warn(`[IntroFlowService] Guild ${guildId} not found when awarding role to ${userId}`);
                    return;
                }

                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) {
                    console.warn(`[IntroFlowService] Member ${userId} not found in guild ${guildId} when awarding role`);
                    return;
                }

                if (member.roles.cache.has(DODO_BUILDER_ROLE_ID!)) {
                    console.log(`User ${userId} already has Dodo Builder role`);
                    return;
                }

                await member.roles.add(DODO_BUILDER_ROLE_ID!, 'Completed intro and project form');
                console.log(`✅ Awarded Dodo Builder role to user ${userId}`);
            } catch (e) {
                console.error(`Failed to award Dodo Builder role to user ${userId}:`, e);
            }
        }
    }

    /**
     * Handles button interactions related to intro flow (start_intro_flow and open_modal)
     * Returns true if the interaction was handled by this service, false otherwise.
     */
    public async handleButton(bi: ButtonInteraction): Promise<boolean> {
        if (!this.client) {
            this.client = bi.client;
        }

        const parts = bi.customId.split('|');

        if (parts[0] === 'start_intro_flow') {
            const targetUserId = parts[1];
            const guildId = parts[2] || bi.guildId || GUILD_ID!;

            if (targetUserId && bi.user.id !== targetUserId) {
                await bi.reply({ content: 'This button is for someone else.', ephemeral: true });
                return true;
            }

            const effectiveUserId = targetUserId || bi.user.id;

            const introButton = new ButtonBuilder()
                .setCustomId(`open_modal|intro|${effectiveUserId}|${guildId}|${INTRO_CHANNEL_ID}`)
                .setLabel('Fill Introduction')
                .setStyle(ButtonStyle.Primary);

            const workingButton = new ButtonBuilder()
                .setCustomId(`open_modal|working|${effectiveUserId}|${guildId}|${WORKING_ON_CHANNEL_ID}`)
                .setLabel("What You're Working On")
                .setStyle(ButtonStyle.Primary);

            const showcaseButton = new ButtonBuilder()
                .setCustomId(`open_modal|showcase|${effectiveUserId}|${guildId}|${SHOWCASE_CHANNEL_ID}`)
                .setLabel("Showcase Project")
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(introButton, workingButton, showcaseButton);
            const welcomeEmbed = this.buildWelcomeEmbed(effectiveUserId);

            await bi.reply({ embeds: [welcomeEmbed], components: [row], ephemeral: true });
            return true;
        }

        if (parts[0] === 'open_modal') {
            const flow = parts[1] as 'intro' | 'working' | 'showcase';
            const targetUserId = parts[2];
            const guildId = parts[3];
            const channelId = parts[4];

            if (bi.user.id !== targetUserId) {
                await bi.reply({ content: 'Only the invited user can fill this form.', ephemeral: true });
                return true;
            }

            const modal = new ModalBuilder()
                .setCustomId(`submit_modal|${flow}|${targetUserId}|${guildId}|${channelId}`);

            if (flow === 'intro') {
                modal.setTitle('Introduce yourself');

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
                return true;
            }

            const isShowcase = flow === 'showcase';
            modal.setTitle(isShowcase ? 'Showcase your project' : "What you're working on");

            const productNameInput = new TextInputBuilder()
                .setCustomId('product_name')
                .setLabel("Product's name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('The product name')
                .setMaxLength(100);

            const productAboutInput = new TextInputBuilder()
                .setCustomId('product_about')
                .setLabel(isShowcase ? 'What did you build?' : 'What is it about?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder(isShowcase ? 'Describe your finished product...' : 'Describe the product in a few lines...')
                .setMaxLength(2000);

            const prow1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(productNameInput);
            const prow2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(productAboutInput);

            await bi.showModal(modal.addComponents(prow1, prow2));
            return true;
        }

        return false;
    }

    /**
     * Handles modal form submissions for intro, working, and showcase
     * Returns true if the submission was handled by this service, false otherwise.
     */
    public async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
        const customId = interaction.customId;
        if (!customId.startsWith('submit_modal|')) return false;

        const parts = customId.split('|');
        if (parts.length < 5) return false;
        const flowType = parts[1] as 'intro' | 'working' | 'showcase';
        const targetUserId = parts[2];
        const guildId = parts[3];
        const channelId = parts[4];

        if (interaction.user.id !== targetUserId) {
            await interaction.reply({ content: "You're not allowed to submit this. This prompt was for someone else.", ephemeral: true });
            return true;
        }

        await interaction.deferReply({ ephemeral: true });

        if (!this.userCompletions.has(targetUserId)) {
            this.userCompletions.set(targetUserId, { completions: new Set(), timestamp: Date.now() });
        }
        const userData = this.userCompletions.get(targetUserId)!;
        userData.completions.add(flowType);
        userData.timestamp = Date.now();

        if (!this.client) {
            this.client = interaction.client;
        }

        try {
            if (flowType === 'intro') {
                const name = interaction.fields.getTextInputValue('name_input');
                const about = interaction.fields.getTextInputValue('about_input');

                const destChannel = await this.client.channels.fetch(channelId) as TextChannel | null;
                if (!destChannel) {
                    await interaction.editReply({ content: 'Could not find destination channel to post your message. Contact a mod.' });
                    return true;
                }

                const introEmbed = this.buildIntroEmbed(name, targetUserId, about);
                await destChannel.send({ embeds: [introEmbed] });

                const uData = this.userCompletions.get(targetUserId);
                const hasProject = uData && (uData.completions.has('working') || uData.completions.has('showcase'));
                const completed = uData && uData.completions.has('intro') && hasProject;

                await interaction.editReply({
                    content: completed
                        ? 'Thanks — your introduction has been posted publicly in the server! ✅ You have completed both steps and will receive the Dodo Builder role shortly!'
                        : 'Thanks — your introduction has been posted publicly in the server! One more step (share project) to go to get your Dodo Builder role!'
                });

                await this.checkAndAwardBadge(targetUserId, guildId);
                return true;
            }

            if (flowType === 'showcase') {
                const product = interaction.fields.getTextInputValue('product_name');
                const about = interaction.fields.getTextInputValue('product_about');

                const showcaseChannel = await this.client.channels.fetch(channelId) as TextChannel | null;
                if (!showcaseChannel) {
                    await interaction.editReply({ content: 'Could not find the showcase channel to post your message. Contact a mod.' });
                    return true;
                }

                const showcaseEmbed = this.buildShowcaseEmbed(product, targetUserId, about);
                const parentMsg = await showcaseChannel.send({ embeds: [showcaseEmbed] });

                const publicThread = await parentMsg.startThread({
                    name: product.slice(0, 100),
                    autoArchiveDuration: 1440,
                });

                try {
                    await publicThread.members.add(targetUserId);
                } catch (err) {
                    console.warn('Could not add user to public thread (may be fine):', err);
                }

                const uData = this.userCompletions.get(targetUserId);
                const hasIntro = uData && uData.completions.has('intro');
                const completed = hasIntro && uData.completions.has('showcase');

                await interaction.editReply({
                    content: completed
                        ? 'Thanks — your showcase has been posted in a public thread! ✅ You have completed both steps and will receive the Dodo Builder role shortly!'
                        : 'Thanks — your showcase has been posted in a public thread! One more step (intro) to go to get your Dodo Builder role!'
                });

                await this.checkAndAwardBadge(targetUserId, guildId);
                return true;
            }

            // flowType === 'working'
            const product = interaction.fields.getTextInputValue('product_name');
            const about = interaction.fields.getTextInputValue('product_about');

            const workingChannel = await this.client.channels.fetch(channelId) as TextChannel | null;
            if (!workingChannel) {
                await interaction.editReply({ content: 'Could not find the working-on channel to post your message. Contact a mod.' });
                return true;
            }

            const workingEmbed = this.buildWorkingOnEmbed(product, targetUserId, about);
            const parentMsg = await workingChannel.send({ embeds: [workingEmbed] });

            const publicThread = await parentMsg.startThread({
                name: product.slice(0, 100),
                autoArchiveDuration: 1440,
            });

            try {
                await publicThread.members.add(targetUserId);
            } catch (err) {
                console.warn('Could not add user to public thread (may be fine):', err);
            }

            const uData = this.userCompletions.get(targetUserId);
            const hasIntro = uData && uData.completions.has('intro');
            const completed = hasIntro && uData.completions.has('working');

            await interaction.editReply({
                content: completed
                    ? 'Thanks — your working-on message has been posted in a public thread! ✅ You have completed both steps and will receive the Dodo Builder role shortly!'
                    : 'Thanks — your working-on message has been posted in a public thread! One more step (intro) to go to get your Dodo Builder role!'
            });

            await this.checkAndAwardBadge(targetUserId, guildId);
            return true;
        } catch (e) {
            console.error('[IntroFlowService] Failed in modal submission:', e);
            await interaction.editReply({ content: 'Something went wrong while processing your submission. Contact a mod.' });
            return true;
        }
    }

    /**
     * Handles the /ping-intro slash command (moderator only)
     */
    public async handlePingIntroCommand(cmd: CommandInteraction): Promise<void> {
        if (!this.client) {
            this.client = cmd.client;
        }

        const member = cmd.member as GuildMember | null;
        if (!member) {
            await cmd.reply({ content: 'Could not verify your membership. You cannot run this command.', ephemeral: true });
            return;
        }

        if (!member.roles.cache.has(MOD_ROLE_ID!)) {
            await cmd.reply({ content: 'You need the moderator role to use this command.', ephemeral: true });
            return;
        }

        const targets: string[] = [];
        for (let i = 1; i <= 5; i++) {
            const user = cmd.isChatInputCommand() ? cmd.options.getUser(`user${i}`) : null;
            if (user) {
                targets.push(user.id);
            }
        }

        if (targets.length === 0) {
            targets.push(cmd.user.id);
        }

        await cmd.reply({ content: `Starting intro flow for ${targets.length} user(s)...`, ephemeral: true });

        for (const targetId of targets) {
            await this.startIntroFlow(cmd.guildId || GUILD_ID!, targetId);
        }
    }
}

export const introFlowService = new IntroFlowService();
