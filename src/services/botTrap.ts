import { Message } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

class BotTrapService {
    private trapChannelId: string | undefined;

    constructor() {
        this.trapChannelId = process.env.BOTS_TRAP_CHANNEL;
    }

    /**
     * Handles incoming messages to check if posted in the honeypot channel.
     * Bans the author if posted in DODO_TRAP_CHANNEL.
     * @returns true if the message was in the honeypot channel and handled, false otherwise.
     */
    public async handleMessage(message: Message): Promise<boolean> {
        if (!this.trapChannelId || !message.guild || message.author.bot) {
            return false;
        }

        if (message.channelId === this.trapChannelId) {
            try {
                console.log(`[BotTrapService] Honeypot triggered by user ${message.author.tag} (${message.author.id}) in channel ${message.channelId}`);

                // Delete the triggering message if deletable
                if (message.deletable) {
                    await message.delete().catch(err => console.warn('[BotTrapService] Failed to delete honeypot message:', err));
                }

                // Ban the user from the guild
                await message.guild.members.ban(message.author.id, {
                    reason: 'Posted content in honeypot channel',
                    deleteMessageSeconds: 60 * 60 * 24 // Delete past 24 hours of messages
                });

                console.log(`[BotTrapService] Successfully banned user ${message.author.tag} (${message.author.id})`);
            } catch (error) {
                console.error(`[BotTrapService] Failed to ban user ${message.author.tag} (${message.author.id}):`, error);
            }
            return true;
        }

        return false;
    }
}

export const botTrapService = new BotTrapService();
