import { reminderService } from '../../src/services/reminderService';
import { jest, describe, beforeEach, test, expect } from '@jest/globals';

// Mock discord.js
jest.mock('discord.js', () => {
    return {
        Client: jest.fn(),
        ActionRowBuilder: jest.fn().mockImplementation(() => ({
            addComponents: jest.fn().mockReturnThis()
        })),
        ButtonBuilder: jest.fn().mockImplementation(() => ({
            setCustomId: jest.fn().mockReturnThis(),
            setLabel: jest.fn().mockReturnThis(),
            setStyle: jest.fn().mockReturnThis()
        })),
        ButtonStyle: {
            Primary: 'Primary'
        },
        EmbedBuilder: jest.fn().mockImplementation(() => ({
            setTitle: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
            setFooter: jest.fn().mockReturnThis(),
            setTimestamp: jest.fn().mockReturnThis()
        }))
    };
});

// Mock node-cron
jest.mock('node-cron', () => ({
    schedule: jest.fn(),
    ScheduledTask: jest.fn()
}));

describe('ReminderService', () => {
    let mockClient: any;
    let mockUser: any;

    beforeEach(() => {
        // Reset mocks and internal state if possible
        // Since reminderService is a singleton exported instance, we might need to clear its array manually if we could
        // But for now we'll just test the public methods and access private ones via any

        mockUser = {
            id: 'user123',
            send: jest.fn().mockImplementation(() => Promise.resolve(true))
        };

        // Create a manual mock client object
        mockClient = {
            users: {
                fetch: jest.fn().mockImplementation(() => Promise.resolve(mockUser))
            }
        };

        // Reset the service state (hacky but needed for singleton)
        (reminderService as any).reminders = [];
        (reminderService as any).client = null;
    });

    test('should initialize correctly', () => {
        reminderService.initialize(mockClient);
        expect((reminderService as any).client).toBe(mockClient);
    });

    test('should schedule a reminder', async () => {
        await reminderService.scheduleReminder('guild1', 'user1');
        const reminders = (reminderService as any).reminders;
        expect(reminders.length).toBe(1);
        expect(reminders[0].userId).toBe('user1');
        expect(reminders[0].sent).toBe(false);
    });

    test('should not duplicate reminder for same user', async () => {
        await reminderService.scheduleReminder('guild1', 'user1');
        await reminderService.scheduleReminder('guild1', 'user1');
        const reminders = (reminderService as any).reminders;
        expect(reminders.length).toBe(1);
    });

    test('should cancel a reminder', async () => {
        await reminderService.scheduleReminder('guild1', 'user1');
        await reminderService.cancelReminder('guild1', 'user1');
        const reminders = (reminderService as any).reminders;
        expect(reminders.length).toBe(0);
    });

    test('should process pending reminders', async () => {
        reminderService.initialize(mockClient);

        // Manually add a reminder that is due
        const pastDate = new Date(Date.now() - 10000);
        (reminderService as any).reminders.push({
            guildId: 'guild1',
            userId: 'user123',
            reminderType: '24h_intro_incomplete',
            scheduledFor: pastDate,
            sent: false
        });

        // Call private method
        await (reminderService as any).processPendingReminders();

        expect(mockClient.users.fetch).toHaveBeenCalledWith('user123');
        expect(mockUser.send).toHaveBeenCalled();

        const reminders = (reminderService as any).reminders;
        expect(reminders[0].sent).toBe(true);
    });
});
