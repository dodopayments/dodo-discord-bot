import { Message, TextChannel } from 'discord.js';

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
        "...scammer...",
        "...scammed..."
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
                    } catch (e) { }
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

    public async handleMessage(message: Message): Promise<boolean> {
        try {
            return await this.checkAndBanSpammer(message);
        } catch (error) {
            console.error('Error in moderation service:', error);
            return false;
        }
    }
}

export const moderationService = new ModerationService();
