import { Message, TextChannel, ThreadChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
    N8N_WEBHOOK_URL: process.env.N8N_PRODUCTION_URL,
    VALID_CHANNELS: [process.env.BOT_TEST_CHANNEL, process.env.GET_HELP_CHANNEL],
    MAX_MESSAGE_LENGTH: 1900,
    MAX_THREAD_NAME_LENGTH: 100,
    MIN_QUERY_LENGTH: 3,
    IST_OFFSET_HOURS: 5.5,
    WEEKEND_MESSAGE_TEMPLATE: "Hey <@{userId}>, We have limited availability over weekends, but rest assured we'll get back to you as soon as possible!",
    MOD_ROLE_ID: process.env.MOD_ROLE_ID
};


class SupportBotService {
    // Utility Functions
    private splitMessageIntoChunks(message: string, maxLength: number = CONFIG.MAX_MESSAGE_LENGTH): string[] {
        const chunks: string[] = [];
        let currentChunk = '';

        const lines = message.split('\n');

        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }

                if (line.length > maxLength) {
                    const words = line.split(' ');
                    for (const word of words) {
                        if (currentChunk.length + word.length + 1 > maxLength) {
                            if (currentChunk.length > 0) {
                                chunks.push(currentChunk.trim());
                                currentChunk = '';
                            }
                        }
                        currentChunk += (currentChunk.length > 0 ? ' ' : '') + word;
                    }
                } else {
                    currentChunk = line;
                }
            } else {
                currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    private async sendMessageWithChunking(channel: TextChannel | ThreadChannel, message: string, isWeekend: boolean = false, weekendMessage: string = '', replyTo?: Message, showResolveButton: boolean = true) {
        const chunks = this.splitMessageIntoChunks(message);

        for (let i = 0; i < chunks.length; i++) {
            const isLastMessage = (i === chunks.length - 1) && (!isWeekend || !weekendMessage);
            const components = [];

            if (isLastMessage && showResolveButton) {
                const resolveButton = new ButtonBuilder()
                    .setCustomId('mark_resolved')
                    .setLabel('My query is resolved')
                    .setStyle(ButtonStyle.Success);
                components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(resolveButton));
            }

            const messageOptions: any = { content: chunks[i] };
            if (components.length > 0) {
                messageOptions.components = components;
            }

            if (i === 0 && replyTo) {
                await replyTo.reply(messageOptions);
            } else {
                await channel.send(messageOptions);
            }

            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (isWeekend && weekendMessage) {
            const components = [];
            if (showResolveButton) {
                const resolveButton = new ButtonBuilder()
                    .setCustomId('mark_resolved')
                    .setLabel('My query is resolved')
                    .setStyle(ButtonStyle.Success);
                components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(resolveButton));
            }

            if (components.length > 0) {
                await channel.send({ content: weekendMessage, components });
            } else {
                await channel.send({ content: weekendMessage });
            }
        }
    }

    private isWeekendInIST(timestamp: number): boolean {
        const date = new Date(timestamp);
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (CONFIG.IST_OFFSET_HOURS * 60 * 60 * 1000));

        const day = istDate.getDay(); // 0 = Sunday, 6 = Saturday
        return day === 0 || day === 6;
    }


    private isValidChannel(channel: any): boolean {
        return channel && (CONFIG.VALID_CHANNELS.includes(channel.id) || CONFIG.VALID_CHANNELS.includes(channel.parentId));
    }

    private shouldProcessMessage(message: Message, isBotMentioned: boolean): boolean {
        // Don't process bot messages
        if (message.author.bot) {
            console.log('Message is from bot, skipping...');
            return false;
        }


        // Check query length
        const queryWords = message.content.split(' ');
        if (queryWords.length <= CONFIG.MIN_QUERY_LENGTH) {
            console.log('Query too short, skipping...');
            return false;
        }

        // If message has a thread, must invoke support command
        // Snippet: if ((message.position !== null && message.position !== 0) && !isBotMentioned)
        // In discord.js v14, message.position is deprecated/removed in favor of other checks, but assuming types allow it or we use alternatives.
        // Actually message.position property exists on Message but strictly it's "A generally increasing integer...".
        // The snippet used it to detect if it's inside a thread? Or if it's not the first message?
        // "message.position !== 0" implies checking if it's the start of a thread or channel?
        // Actually, let's stick to the snippet logic but be careful with types.
        // If message is in a thread, `message.channel.isThread()` is true.
        // The snippet had: `if ((message.position !== null && message.position !== 0) && !isBotMentioned)`
        // `message.position` is likely undefined/null in newer d.js or different.
        // However, let's keep it close to snippet. 
        // In recent discord.js, `message.position` might not be what they think. 
        // But for now I'll just copy the logic. If TS complains I'll fix.
        // Actually, `message.position` is NOT on Message in v14. It was removed.
        // I should probably check if `message.channel.isThread()` and it's not the starter message?
        // Or maybe just `if (message.channel.isThread() && !isBotMentioned)`?
        // The snippet comment says: "If message has a thread, must invoke support command".

        if (message.channel.isThread() && !isBotMentioned) {
            // Allow processing if it's the starter message of the thread (e.g. Forum Post)
            // In Discord, the starter message of a thread often shares the ID with the thread itself (especially in Forums)
            const isStarterMessage = message.id === message.channel.id;

            if (!isStarterMessage) {
                console.log('Message inside thread without bot mention, skipping...');
                return false;
            }
        }

        return true;
    }

    private async getN8NResponse(query: string): Promise<string> {
        try {
            if (!CONFIG.N8N_WEBHOOK_URL) {
                throw new Error('N8N_WEBHOOK_URL is not configured');
            }

            const response = await fetch(CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: { query }
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseText = await response.text();
            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                return 'Error parsing N8N response';
            }

            return responseData[0]?.output || 'No response data found';
        } catch (error) {
            console.error('Error getting N8N response:', error);
            throw error;
        }
    }

    private truncateThreadName(content: string): string {
        if (content.length >= CONFIG.MAX_THREAD_NAME_LENGTH) {
            return content.slice(0, CONFIG.MAX_THREAD_NAME_LENGTH - 2);
        }
        return content;
    }

    public async handleMessage(message: Message) {
        try {
            // Get channel and check if bot is mentioned
            // In v14, message.channel is already fetched usually, but snippet fetches it?
            // "const channel = await client.channels.fetch(message.channelId);"
            // validChannel check uses channel.parentId too.
            const channel = message.channel;
            // if channel is partial we might need fetch, but usually message.channel is enough for checking ID.
            // However, to get parentId of a thread, we might need to ensure it's available.

            const isBotMentioned = message.mentions.users.has(message.client.user?.id || '');

            // Check if message should be processed based on channel validity or bot mention
            const isFromValidChannel = this.isValidChannel(channel);

            // Skip if message is not from valid channel AND bot is not mentioned
            if (!isFromValidChannel && !isBotMentioned) {
                // console.log('Message not from valid channel and bot not mentioned, skipping...'); // Reduce spam
                return;
            }

            console.log("//////MESSAGE//////");
            console.log(`Processing message: ${message.content}`);

            // Check if message should be processed
            if (!this.shouldProcessMessage(message, isBotMentioned)) {
                return;
            }

            // Get query - include entire thread conversation if message is in a thread
            let query = message.content;

            // If message is in a thread, fetch the entire thread conversation
            if (channel.isThread()) {
                try {
                    const thread = channel as ThreadChannel;
                    const threadMessages = await thread.messages.fetch({ limit: 100 }); // Fetch up to 100 messages
                    console.log("//////THREAD MESSAGES//////");
                    // console.log(threadMessages);
                    // Build conversation history
                    const conversationHistory: string[] = [];
                    // threadMessages is a Collection. sort() returns a new Collection/Map array-like?
                    // In v14 collection has sort method.
                    const sortedMessages = threadMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                    sortedMessages.forEach(threadMessage => {
                        conversationHistory.push(`${threadMessage.author.username}: ${threadMessage.content}`);
                    });

                    // Combine conversation history
                    if (conversationHistory.length > 0) {
                        query = `Thread Conversation:\n${conversationHistory.join('\n')}\n\nCurrent Message:\n${message.content}`;
                    }
                } catch (error) {
                    console.error('Error fetching thread messages:', error);
                }
            }

            // Get weekend status
            const isWeekend = this.isWeekendInIST(message.createdTimestamp);
            const weekendMessage = isWeekend
                ? CONFIG.WEEKEND_MESSAGE_TEMPLATE.replace("{userId}", message.author.id)
                : '';

            // Get response from N8N
            console.log("//////QUERY//////")
            console.log(query)
            let reply = await this.getN8NResponse(query);
            console.log("//////REPLY//////")
            console.log(reply)
            reply = reply.replace(/【[^】]*llms-full\.txt】/g, '');
            console.log("//////REPLY AFTER REGEX REPLACEMENT//////")
            console.log(reply)

            // Send response
            const threadName = this.truncateThreadName(message.content);

            if (channel.isThread()) {
                // Reply in existing thread
                await this.sendMessageWithChunking(channel as ThreadChannel, reply, isWeekend, weekendMessage, message);
            } else {
                // Create new thread
                // Only TextChannel/NewsChannel has startThread usually (message.startThread helper exists in recent versions)
                const threadChannel = await message.startThread({ name: threadName });
                await this.sendMessageWithChunking(threadChannel, reply, isWeekend, weekendMessage);
            }

        } catch (error) {
            console.error('Error processing message:', error);

            // Send fallback response
            try {
                const threadName = this.truncateThreadName(message.content);
                // Check if already in thread
                if (!message.channel.isThread()) {
                    const threadChannel = await message.startThread({ name: threadName });
                    const fallbackMessage = 'Hey, thanks for reaching out. One of our team members will respond shortly.';
                    await threadChannel.send(fallbackMessage);
                } else {
                    await message.reply('Hey, thanks for reaching out. One of our team members will respond shortly.');
                }
            } catch (fallbackError) {
                console.error('Error sending fallback message:', fallbackError);
            }
        }
    }
    public async handleMovedMessage(thread: ThreadChannel, query: string, originalAuthorId: string) {
        try {
            console.log("//////PROCESSING MOVED MESSAGE//////");
            console.log(`Query: ${query}`);

            // Get weekend status
            const isWeekend = this.isWeekendInIST(Date.now());
            const weekendMessage = isWeekend
                ? CONFIG.WEEKEND_MESSAGE_TEMPLATE.replace("{userId}", originalAuthorId)
                : '';

            // Get response from N8N
            let reply = await this.getN8NResponse(query);
            reply = reply.replace(/【[^】]*llms-full\.txt】/g, '');

            // Send response in the thread
            await this.sendMessageWithChunking(thread, reply, isWeekend, weekendMessage);

        } catch (error) {
            console.error('Error processing moved message:', error);
            try {
                const fallbackMessage = 'Hey, thanks for reaching out. One of our team members will respond shortly.';
                await thread.send(fallbackMessage);
            } catch (fallbackError) {
                console.error('Error sending fallback message for moved message:', fallbackError);
            }
        }
    }

    public async handleBotAnswerCommand(message: Message) {
        try {
            // Check if user has moderator role
            if (!message.member || !CONFIG.MOD_ROLE_ID || !message.member.roles.cache.has(CONFIG.MOD_ROLE_ID)) {
                await message.reply('You need the moderator role to use this command.');
                return;
            }

            if (!message.channel.isTextBased() || message.channel.isThread()) {
                await message.reply('This command can only be used in regular text channels.');
                return;
            }

            const args = message.content.trim().split(/\s+/);
            let messageId = message.reference?.messageId;

            if (!messageId && args.length > 1) {
                messageId = args[1];
            }

            if (!messageId) {
                await message.reply('Please reply to a message or provide a message ID. Usage: Reply with `!bot-answer` OR `!bot-answer [message-id]`');
                return;
            }

            const success = await this.processBotAnswer(message.channel as TextChannel, messageId, message);

            // Once successful, optionally clear the trigger message to keep chat clean
            if (success) {
                if (message.deletable) {
                    try { await message.delete(); } catch (e) { console.error('Could not delete command message:', e); }
                }
            }
        } catch (error) {
            console.error('Error in handleBotAnswerCommand:', error);
            await message.reply('An error occurred while executing the command.');
        }
    }

    public async handleBotAnswerInteraction(interaction: ChatInputCommandInteraction) {
        try {
            // Check if user has moderator role
            const member: any = interaction.member;
            if (!member || !CONFIG.MOD_ROLE_ID || !member.roles.cache.has(CONFIG.MOD_ROLE_ID)) {
                await interaction.reply({ content: 'You need the moderator role to use this command.', ephemeral: true });
                return;
            }

            if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isThread()) {
                await interaction.reply({ content: 'This command can only be used in regular text channels.', ephemeral: true });
                return;
            }

            const messageId = interaction.options.getString('message_id');
            if (!messageId) {
                await interaction.reply({ content: 'Message ID is required.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const success = await this.processBotAnswer(interaction.channel as TextChannel, messageId);

            if (success) {
                await interaction.editReply({ content: `Successfully answered message \`${messageId}\`.` });
            } else {
                await interaction.editReply({ content: `Failed to answer message \`${messageId}\`. Please ensure the ID is valid and in this channel.` });
            }
        } catch (error) {
            console.error('Error in handleBotAnswerInteraction:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: 'An error occurred while executing the command.' });
            } else {
                await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
            }
        }
    }

    private async processBotAnswer(channel: TextChannel, messageId: string, replyToMessage?: Message): Promise<boolean> {
        try {
            const cleanMessageId = messageId.trim();
            const targetMessage = await channel.messages.fetch(cleanMessageId);
            if (!targetMessage) {
                if (replyToMessage) await replyToMessage.reply('Could not find the specified message in this channel.');
                return false;
            }

            if (targetMessage.author.bot) {
                if (replyToMessage) await replyToMessage.reply('I cannot answer messages sent by bots.');
                return false;
            }

            const query = targetMessage.content;
            if (!query) {
                if (replyToMessage) await replyToMessage.reply('The specified message has no text content.');
                return false;
            }

            const isWeekend = this.isWeekendInIST(Date.now());
            const weekendMessage = isWeekend
                ? CONFIG.WEEKEND_MESSAGE_TEMPLATE.replace("{userId}", targetMessage.author.id)
                : '';

            console.log(`//////BOT ANSWER QUERY//////`);
            console.log(query);

            // Show typing indicator in the channel
            await channel.sendTyping();

            let reply: string;
            try {
                reply = await this.getN8NResponse(query);
                reply = reply.replace(/【[^】]*llms-full\.txt】/g, '');
            } catch (n8nError) {
                console.error('Error fetching N8N response:', n8nError);
                reply = 'Hey, the team will get back to you soon!';
            }

            console.log(`//////BOT ANSWER REPLY//////`);
            console.log(reply);

            // Directly reply to the target message without creating a thread
            // Pass false for showResolveButton
            await this.sendMessageWithChunking(channel, reply, isWeekend, weekendMessage, targetMessage, false);
            return true;

        } catch (error) {
            console.error('Error in processBotAnswer:', error);
            if (replyToMessage) await replyToMessage.reply('An unexpected error occurred while processing the command. Ensure the message ID is correct and from this channel.');
            return false;
        }
    }
}

export const supportBotService = new SupportBotService();
