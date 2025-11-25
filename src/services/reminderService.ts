/**
 * Reminder service for 24-hour intro incomplete reminders (In-Memory)
 */

import cron from 'node-cron';
import { Client, User, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createReminderEmbed } from '../utils/embeds.js';
import { DURATION } from '../utils/constants.js';

interface Reminder {
    guildId: string;
    userId: string;
    reminderType: string;
    scheduledFor: Date;
    sent: boolean;
}

class ReminderService {
    private client: Client | null = null;
    private cronJob: cron.ScheduledTask | null = null;
    private reminders: Reminder[] = [];

    /**
     * Initialize the reminder service with Discord client
     */
    initialize(client: Client): void {
        this.client = client;

        // Schedule cron job to run every hour
        this.cronJob = cron.schedule(DURATION.REMINDER_CHECK_INTERVAL, async () => {
            await this.processPendingReminders();
        });

        console.log('✅ Reminder service initialized (In-Memory)');
    }

    /**
     * Schedule a 24-hour reminder for a user
     */
    async scheduleReminder(guildId: string, userId: string): Promise<void> {
        const scheduledFor = new Date(Date.now() + DURATION.REMINDER_DELAY_MS);

        // Check if already exists
        const exists = this.reminders.some(
            r => r.guildId === guildId && r.userId === userId && r.reminderType === '24h_intro_incomplete' && !r.sent
        );

        if (exists) {
            console.log(`Reminder already scheduled for user ${userId}`);
            return;
        }

        this.reminders.push({
            guildId,
            userId,
            reminderType: '24h_intro_incomplete',
            scheduledFor,
            sent: false,
        });

        console.log(`Scheduled 24h reminder for user ${userId} at ${scheduledFor.toISOString()}`);
    }

    /**
     * Cancel a reminder for a user
     */
    async cancelReminder(guildId: string, userId: string): Promise<void> {
        const index = this.reminders.findIndex(
            r => r.guildId === guildId && r.userId === userId && r.reminderType === '24h_intro_incomplete' && !r.sent
        );

        if (index !== -1) {
            this.reminders.splice(index, 1);
            console.log(`Cancelled reminder for user ${userId}`);
        }
    }

    /**
     * Process all pending reminders
     */
    private async processPendingReminders(): Promise<void> {
        if (!this.client) return;

        const now = new Date();
        const pendingReminders = this.reminders.filter(r => !r.sent && r.scheduledFor <= now);

        console.log(`Processing ${pendingReminders.length} pending reminders`);

        for (const reminder of pendingReminders) {
            await this.sendReminder(reminder);
        }
    }

    /**
     * Send a reminder to a user
     */
    private async sendReminder(reminder: Reminder): Promise<void> {
        if (!this.client) return;

        try {
            // Send reminder DM
            try {
                const user: User = await this.client.users.fetch(reminder.userId);
                const embed = createReminderEmbed(reminder.userId);

                // Include the welcome buttons again
                const introButton = new ButtonBuilder()
                    .setCustomId(`open_modal|intro|${reminder.userId}|${reminder.guildId}|${process.env.INTRO_CHANNEL_ID}`)
                    .setLabel('Fill Introduction')
                    .setStyle(ButtonStyle.Primary);

                const workingButton = new ButtonBuilder()
                    .setCustomId(`open_modal|working|${reminder.userId}|${reminder.guildId}|${process.env.WORKING_ON_CHANNEL_ID}`)
                    .setLabel("Fill What I'm Working On")
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(introButton, workingButton);

                await user.send({ embeds: [embed], components: [row] });

                // Mark as sent
                reminder.sent = true;

                console.log(`✅ Sent 24h reminder to user ${reminder.userId}`);
            } catch (dmError) {
                console.warn(`Could not send reminder DM to user ${reminder.userId}:`, dmError);
                // Mark as sent anyway to avoid retry spam
                reminder.sent = true;
            }
        } catch (error) {
            console.error('Failed to send reminder:', error);
        }
    }

    /**
     * Stop the reminder service
     */
    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('Reminder service stopped');
        }
    }
}

export const reminderService = new ReminderService();
