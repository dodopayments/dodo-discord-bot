import { Client, Message, TextChannel, AttachmentBuilder, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class BotTrapService {
    private trapChannelId: string | undefined;
    private modRoleId: string | undefined;
    private currentlyBanningUserIds: Set<string> = new Set();
    private trapArmed: boolean = false;

    constructor() {
        this.trapChannelId = process.env.BOTS_TRAP_CHANNEL;
        this.modRoleId = process.env.MOD_ROLE_ID;
    }

    /**
     * Initializes the bot trap service by checking if the honeypot channel has messages.
     * If the channel is empty, posts the initial warning message and attachment image.
     */
    public async initialize(client: Client): Promise<void> {
        if (!this.trapChannelId) {
            console.warn('[BotTrapService] BOTS_TRAP_CHANNEL is not set. Service disarmed.');
            this.trapArmed = false;
            return;
        }

        try {
            const channel = await client.channels.fetch(this.trapChannelId);
            if (!channel || !(channel instanceof TextChannel)) {
                console.warn(`[BotTrapService] Trap channel ${this.trapChannelId} not found or is not a TextChannel. Service disarmed.`);
                this.trapArmed = false;
                return;
            }

            // Successfully validated TextChannel
            this.trapArmed = true;

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
            this.trapArmed = false;
        }
    }

    /**
     * Handles incoming messages to check if posted in the honeypot channel.
     * Bans the author if posted in BOTS_TRAP_CHANNEL, unless they have exempt roles/permissions.
     * @returns true if the message was in the honeypot channel and handled, false otherwise.
     */
    public async handleMessage(message: Message): Promise<boolean> {
        if (!this.trapChannelId || !this.trapArmed || !message.guild || message.author.bot) {
            return false;
        }

        if (message.channelId === this.trapChannelId) {
            // Deduplicate concurrent messages from rapid spammers
            if (this.currentlyBanningUserIds.has(message.author.id)) {
                if (message.deletable) {
                    await message.delete().catch(() => {});
                }
                return true;
            }

            try {
                // Ensure member object is fully resolved (fail-closed check)
                let member = message.member;
                if (!member) {
                    member = await message.guild.members.fetch(message.author.id).catch(() => null);
                }

                // If member cannot be resolved, skip to fail safe
                if (!member) {
                    console.warn(`[BotTrapService] Could not resolve member for ${message.author.tag} (${message.author.id}). Skipping trap.`);
                    return false;
                }

                // Check staff / admin / mod exemptions (fail closed)
                const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                                member.permissions.has(PermissionsBitField.Flags.ManageGuild);
                const isOwner = message.guild.ownerId === message.author.id;
                const hasModRole = this.modRoleId ? member.roles.cache.has(this.modRoleId) : false;

                if (isAdmin || isOwner || hasModRole) {
                    return false;
                }

                // Check if user is bannable according to Discord role hierarchy & permissions
                if (!member.bannable) {
                    console.warn(`[BotTrapService] Member ${message.author.tag} (${message.author.id}) is not bannable (higher role or missing bot permissions).`);
                    return true;
                }

                // Lock user ID to prevent burst duplicate bans
                this.currentlyBanningUserIds.add(message.author.id);

                console.log(`[BotTrapService] Honeypot triggered by user ${message.author.tag} (${message.author.id}) in channel ${message.channelId}`);

                // Delete the triggering message if deletable
                if (message.deletable) {
                    await message.delete().catch(err => console.warn('[BotTrapService] Failed to delete honeypot message:', err));
                }

                // Ban the user from the guild (3600 seconds = 1 hour message history cleanup)
                await message.guild.members.ban(message.author.id, {
                    reason: 'Posted content in honeypot channel',
                    deleteMessageSeconds: 3600
                });

                console.log(`[BotTrapService] Successfully banned user ${message.author.tag} (${message.author.id})`);
            } catch (error) {
                console.error(`[BotTrapService] Failed to ban user ${message.author.tag} (${message.author.id}):`, error);
            } finally {
                this.currentlyBanningUserIds.delete(message.author.id);
            }
            return true;
        }

        return false;
    }
}

export const botTrapService = new BotTrapService();
