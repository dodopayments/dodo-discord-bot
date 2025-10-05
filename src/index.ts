/**
 * Auto-Thread Discord Bot
 * Replicates Needle's auto-threading behavior for Discord servers
 * 
 * Features:
 * - Auto-creates public threads from messages in configured channels
 * - Per-guild persistent configuration
 * - Slash command UI for management
 * - Button interactions for thread management
 * - Rate limiting and error handling
 */

import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { handleMessageCreate } from './handlers/messageCreate.js';
import { handleMessageUpdate } from './handlers/messageUpdate.js';
import { handleMessageDelete } from './handlers/messageDelete.js';
import { handleInteractionCreate } from './handlers/interactionCreate.js';
import { autoThreadCommand } from './commands/auto-thread.js';
import { pingIntroCommand, clearDmCommand } from './commands/intro.js';

// Environment variables
const { DISCORD_TOKEN, CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required to read message content for thread titles
  ],
});

/**
 * Register slash commands with Discord
 */
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

  // Inline ping command (kept here to match prior codebase style)
  const pingJson = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and system metrics')
    .addBooleanOption((opt) =>
      opt
        .setName('ephemeral')
        .setDescription('Show the result only to you (default: false)')
        .setRequired(false)
    )
    .toJSON();

  const commands = [
    autoThreadCommand,
    pingIntroCommand.toJSON(),
    clearDmCommand.toJSON(),
    pingJson,
  ];

  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID!),
      { body: commands }
    );

    console.log('Successfully registered global commands.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// Event: Bot ready
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guilds`);
  
  await registerCommands();
  
  console.log('Auto-Thread Bot is ready!');
});

// Event: Message created
client.on(Events.MessageCreate, async (message) => {
  await handleMessageCreate(message);
});

// Event: Message updated
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  await handleMessageUpdate(oldMessage, newMessage);
});

// Event: Message deleted
client.on(Events.MessageDelete, async (message) => {
  await handleMessageDelete(message);
});

// Event: Interaction created (slash commands, buttons, modals)
client.on(Events.InteractionCreate, async (interaction) => {
  await handleInteractionCreate(interaction);
});

// Error handling
client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Login
client.login(DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login:', err);
  process.exit(1);
});
