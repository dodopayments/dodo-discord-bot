import { Message, TextChannel } from 'discord.js';
import crypto from 'crypto';

const CONFIG = {
    BANNED_SENTENCES: [
        "i'll help...first...start earning...profits...in my bio",
        "hyperliquid new portfolio tracking tool...",
        "...XRP Mystery Box Free Airdrop...A new XRP community...Claim your",
        "O𝐏ΕΝ...𝐇ΕRΕ",
        "ask...here...👇",
        "communicate...admin...👇...ht",
        "Direct...issue...team...channel👇",
        "Direct...issue...team...channel...👇",
        "...CREATE A TICKET...<@",
        "we...excited...announce...free...mint...opensea",
        "I...need...waIIet...transactions...dead...tokens",
        "I’m...spam...anyone...just...I’m...16...making...daily...system...experience reply...interested",
        "𝐈'𝐥𝐥...𝐢𝐧𝐭𝐞𝐫𝐞𝐬𝐭𝐞𝐝...𝐞𝐚𝐫𝐧𝐢𝐧𝐠...𝐫𝐞𝐢𝐦𝐛𝐮𝐫𝐬𝐞...𝐫𝐞𝐜𝐞𝐢𝐯𝐞...𝐩𝐞𝐨𝐩𝐥𝐞...𝐬𝐞𝐧𝐝...𝐓𝐞𝐥𝐞𝐠𝐫𝐚𝐦...𝐥𝐢𝐧𝐤...𝐦𝐲...𝐛𝐢𝐨",
        "please...go...𝗖𝗥𝗘𝗔𝗧𝗘...𝗧𝗜𝗖𝗞𝗘𝗧...team",
        "help...earn...within...pay...your...profit",
        "...**...submit...your...questions...issues...@...",
        "...help...first...people...earning...month...profits",
        "please...support...⬇️...ht...",
        "please...support...⬇️...http...",
        "please...support...⬇️...https...",
        "for...help...go...x.com...status",
        "...go...here...share...google...",
        "...help...first...interested...to...earning...dm...",
        "...submit...questions...issues...below...ht...io..."
    ],
    BANNED_IMAGES: [
        "85c4c41aef0c0aa2e652a64ce917c08bbc3a459c4313016dbd7c12a3710927c1",
        "f303a1ffe7064b5c07ec1c96233cf9a6264eda210e96b81f7232a922717d4b24",
        "5dbe10923b87d3d0f126ff1165f488d6472392417de9210ed25c83896f093992",
        "897940e8a7df7c9c13a750b79a60227f0099f3857f46287614c5edb650490452",
    ]
};

class ModerationService {
    private async deleteRecentUserMessages(channel: TextChannel, userId: string) {
        try {
            const messages = await channel.messages.fetch({ limit: 50 });
            const oneHourAgo = Date.now() - 60 * 60 * 1000;

            const userMessages = messages.filter(msg =>
                msg.author.id === userId &&
                msg.createdTimestamp > oneHourAgo
            );

            if (userMessages.size > 0) {
                console.log(`Deleting ${userMessages.size} messages from ${userId} in ${channel.name}...`);
                await channel.bulkDelete(userMessages).catch(async () => {
                    // Fallback for old messages or if bulk delete fails
                    for (const msg of userMessages.values()) {
                        await msg.delete().catch(() => { });
                    }
                });
            }
        } catch (error) {
            console.error('Error deleting recent user messages:', error);
        }
    }

    private async checkAndBanSpammer(message: Message): Promise<boolean> {
        // Ignore DMs and bot messages
        if (!message.guild || message.author.bot) return false;

        const content = message.content.toLowerCase();

        for (const sentence of CONFIG.BANNED_SENTENCES) {
            const parts = sentence.toLowerCase().split('...');
            // Escape special regex characters
            const escapedParts = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            // Join with .* to match any content
            const regexPattern = escapedParts.join('.*');
            const regex = new RegExp(regexPattern, 's'); // 's' flag for dotAll

            if (regex.test(content)) {
                console.log(`Spam detected from ${message.author.tag}. Pattern: "${sentence}"`);

                // 1. Manually delete recent messages in this channel (helpful if ban fails or for immediate cleanup)
                if (message.channel instanceof TextChannel) {
                    await this.deleteRecentUserMessages(message.channel, message.author.id);
                } else {
                    // Fallback delete query message if not text channel
                    try {
                        if (message.deletable) await message.delete();
                    } catch (e) {
                        console.warn('Could not delete spam message:', e);
                    }
                }

                // 2. Ban the user (If bannable)
                try {
                    const member = message.member;
                    if (member) {
                        if (member.bannable) {
                            // deleteMessageSeconds: 3600 = Delete message history for 1 hour
                            await member.ban({
                                deleteMessageSeconds: 3600,
                                reason: 'Spam'
                            });
                            console.log(`Banned user ${message.author.tag} for using banned sentence. Message: "${message.content}"`);
                        } else {
                            console.warn(`User ${message.author.tag} is not bannable (higher role or owner).`);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to ban user ${message.author.tag}:`, error);
                }

                // Return true to stop further processing of this message
                return true;
            }
        }
        return false;
    }

    public async handleDelete(message: any) {
        try {
            // Partial messages might not have content or author
            if (message.partial) {
                try {
                    message = await message.fetch();
                } catch (error) {
                    console.warn('Could not fetch partial deleted message:', error);
                    return;
                }
            }

            // Ignore bot messages and DMs
            if (message.author?.bot || !message.guild) return;

            const logChannelId = process.env.DELETED_MESSAGES_CHANNEL;
            if (!logChannelId) return;

            const logChannel = await message.client.channels.fetch(logChannelId).catch(() => null);
            if (!logChannel || !(logChannel instanceof TextChannel)) {
                console.warn(`Deleted message log channel ${logChannelId} not found or not a text channel.`);
                return;
            }

            const content = message.content || '*[No text content]*';
            const userMention = message.author ? `<@${message.author.id}>` : 'Unknown User';

            const logMessage = [
                '**Deleted Message!**',
                `User: ${userMention}`,
                '```',
                content,
                '```'
            ].join('\n');

            await logChannel.send(logMessage);
        } catch (error) {
            console.error('Error logging deleted message:', error);
        }
    }

    private async checkAndTimeoutForImages(message: Message): Promise<boolean> {
        // Ignore DMs and bot messages
        if (!message.guild || message.author.bot) return false;

        const attachments = message.attachments;
        if (attachments.size < 2) return false;

        let matchCount = 0;

        for (const attachment of attachments.values()) {
            if (!attachment.contentType?.startsWith('image/')) continue;

            try {
                const response = await fetch(attachment.url);
                if (!response.ok) continue;

                const buffer = await response.arrayBuffer();
                const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

                if (CONFIG.BANNED_IMAGES.includes(hash)) {
                    matchCount++;
                }

                if (matchCount >= 2) {
                    break;
                }
            } catch (error) {
                console.error('Error processing attachment:', error);
            }
        }

        if (matchCount >= 2) {
            console.log(`Banned images detected from ${message.author.tag}. Match count: ${matchCount}`);

            // Delete the message
            try {
                if (message.deletable) await message.delete();
            } catch (e) {
                console.warn('Could not delete message with banned images:', e);
            }

            // Time out user for 3 days
            try {
                const member = message.member;
                if (member) {
                    if (member.moderatable) {
                        await member.timeout(3 * 24 * 60 * 60 * 1000, 'Sending banned images (Hacked Account)');
                        console.log(`Timed out user ${message.author.tag} for sending banned images.`);
                    } else {
                        console.warn(`User ${message.author.tag} is not moderatable.`);
                    }
                }
            } catch (error) {
                console.error(`Failed to timeout user ${message.author.tag}:`, error);
            }

            // Write a message in #general
            const generalChannelId = process.env.GENERAL_CHANNEL_ID;
            if (generalChannelId) {
                const generalChannel = await message.client.channels.fetch(generalChannelId).catch(() => null);
                if (generalChannel && generalChannel.isTextBased() && 'send' in generalChannel) {
                    await generalChannel.send(`Hey <@${message.author.id}>, seems like your account has been hacked. For that reason we've timed you out. Once your account is back, DM a moderator requesting to revoke the timeout.`);
                }
            }

            return true;
        }

        return false;
    }

    public async handleMessage(message: Message): Promise<boolean> {
        try {
            if (await this.checkAndTimeoutForImages(message)) return true;
            return await this.checkAndBanSpammer(message);
        } catch (error) {
            console.error('Error in moderation service:', error);
            return false;
        }
    }
}

export const moderationService = new ModerationService();
