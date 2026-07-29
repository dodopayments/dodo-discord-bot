import { Client, Message, TextChannel, AttachmentBuilder } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BotTrapService {
    private trapChannelId: string | undefined;
    private modRoleId: string | undefined;

    constructor() {
        this.trapChannelId = process.env.BOTS_TRAP_CHANNEL;
        this.modRoleId = process.env.MOD_ROLE_ID;
    }

    /**
     * Initializes the bot trap service by checking if the honeypot channel has messages.
     * If the channel is empty, posts the initial warning message and attachment image.
     */
    public async initialize(client: Client): Promise<void> {
        if (!this.trapChannelId) return;

        try {
            const channel = await client.channels.fetch(this.trapChannelId);
            if (!channel || !(channel instanceof TextChannel)) {
                console.warn(`[BotTrapService] Trap channel ${this.trapChannelId} not found or is not a TextChannel`);
                return;
            }

            const messages = await channel.messages.fetch({ limit: 1 });
            if (messages.size === 0) {
                console.log(`[BotTrapService] Trap channel is empty. Posting honeypot warning message...`);

                const warningContent = [
                    '**STOP, DO NOT TYPE HERE!**',
                    'This channel exists solely to identify bots, hacked accounts, and individuals with an irresistible urge to send spam.',
                    '',
                    'If you can read this, don\'t type.',
                    'If you type, you get banned.',
                    'If you\'re a bot, goodbye!'
                ].join('\n');

                // Try module-relative path first (e.g. dist/src/media or src/media), then fallback to process.cwd()
                const candidatePaths = [
                    path.resolve(__dirname, '..', 'media', 'dodopot-warning.png'),
                    path.resolve(__dirname, '..', '..', 'src', 'media', 'dodopot-warning.png'),
                    path.join(process.cwd(), 'src', 'media', 'dodopot-warning.png')
                ];
                const imagePath = candidatePaths.find(p => fs.existsSync(p));

                if (imagePath) {
                    const attachment = new AttachmentBuilder(imagePath, { name: 'dodopot-warning.png' });
                    await channel.send({
                        content: warningContent,
                        files: [attachment]
                    });
                } else {
                    console.warn(`[BotTrapService] Warning image not found at candidate locations, posting text only.`);
                    await channel.send({ content: warningContent });
                }
            }
        } catch (error) {
            console.error('[BotTrapService] Error initializing trap channel warning message:', error);
        }
    }

    /**
     * Handles incoming messages to check if posted in the honeypot channel.
     * Bans the author if posted in BOTS_TRAP_CHANNEL, unless they have the moderator/team role (MOD_ROLE_ID).
     * @returns true if the message was in the honeypot channel and handled, false otherwise.
     */
    public async handleMessage(message: Message): Promise<boolean> {
        if (!this.trapChannelId || !message.guild || message.author.bot) {
            return false;
        }

        if (message.channelId === this.trapChannelId) {
            // Allow members with MOD_ROLE_ID to post without triggering trap
            if (this.modRoleId && message.member?.roles.cache.has(this.modRoleId)) {
                return false;
            }

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
