import { Message, TextChannel, ThreadChannel } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
    N8N_WEBHOOK_URL: process.env.N8N_PRODUCTION_URL,
    // VALID_CHANNELS: ["1451873829675864176", "1420788292852388022"],
    VALID_CHANNELS: ["1314494170085326870", "1333450965851832432"],
    MAX_MESSAGE_LENGTH: 1900,
    MAX_THREAD_NAME_LENGTH: 100,
    MIN_QUERY_LENGTH: 3,
    IST_OFFSET_HOURS: 5.5,
    WEEKEND_MESSAGE_TEMPLATE: "Hey <@{userId}>, We have limited availability over weekends, but rest assured we'll get back to you as soon as possible!"
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

    private async sendMessageWithChunking(channel: TextChannel | ThreadChannel, message: string, isWeekend: boolean = false, weekendMessage: string = '') {
        const chunks = this.splitMessageIntoChunks(message);

        for (let i = 0; i < chunks.length; i++) {
            await channel.send(chunks[i]);

            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (isWeekend && weekendMessage) {
            await channel.send(weekendMessage);
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
                await this.sendMessageWithChunking(channel as ThreadChannel, reply, isWeekend, weekendMessage);
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
                    await message.channel.send('Hey, thanks for reaching out. One of our team members will respond shortly.');
                }
            } catch (fallbackError) {
                console.error('Error sending fallback message:', fallbackError);
            }
        }
    }
}

export const supportBotService = new SupportBotService();
