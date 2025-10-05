/**
 * Catchup Script - Retroactive Threading
 * 
 * Creates threads for existing messages in enabled channels.
 * Useful when enabling auto-threading for a channel that already has messages.
 * 
 * Usage:
 *   ts-node scripts/catchup.ts <guild-id> <channel-id> [limit]
 * 
 * Example:
 *   ts-node scripts/catchup.ts 123456789 987654321 50
 */

import { Client, GatewayIntentBits, TextChannel, Collection, Message } from 'discord.js';
import { configStore } from '../src/services/configStore.js';
import { createThreadForMessage } from '../src/services/threadService.js';

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable is required');
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: ts-node scripts/catchup.ts <guild-id> <channel-id> [limit]');
  console.error('Example: ts-node scripts/catchup.ts 123456789 987654321 50');
  process.exit(1);
}

const [guildId, channelId, limitArg] = args;
const limit = limitArg ? parseInt(limitArg, 10) : 100;

if (isNaN(limit) || limit < 1) {
  console.error('❌ Limit must be a positive number');
  process.exit(1);
}

async function runCatchup() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  console.log('🤖 Logging in...');
  await client.login(DISCORD_TOKEN);

  console.log(`✅ Logged in as ${client.user?.tag}`);

  try {
    // Fetch guild
    const guild = await client.guilds.fetch(guildId);
    console.log(`📍 Guild: ${guild.name}`);

    // Fetch channel
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      console.error('❌ Channel not found or not a text channel');
      await client.destroy();
      process.exit(1);
    }

    console.log(`📍 Channel: #${channel.name}`);

    // Check if channel is enabled in config
    const config = await configStore.get(guildId);

    if (!config.enabledChannels.includes(channelId)) {
      console.warn(`⚠️  Channel #${channel.name} is not enabled for auto-threading`);
      console.log('Enable it first with: /auto-thread enable channel:#' + channel.name);
      await client.destroy();
      process.exit(1);
    }

    console.log(`\n🔍 Fetching up to ${limit} messages...\n`);

    // Fetch messages
    const messages: Collection<string, Message> = await channel.messages.fetch({ limit });

    console.log(`📬 Found ${messages.size} messages`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // Process messages in chronological order (oldest first)
    const sortedMessages = Array.from(messages.values()).reverse();

    for (const message of sortedMessages) {
      // Skip if already has a thread
      if (message.hasThread) {
        console.log(`⏭️  Skipped (has thread): ${message.id}`);
        skipped++;
        continue;
      }

      try {
        const thread = await createThreadForMessage(message);

        if (thread) {
          console.log(`✅ Created thread "${thread.name}" for message ${message.id}`);
          created++;
        } else {
          console.log(`⏭️  Skipped: ${message.id} (did not meet criteria)`);
          skipped++;
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`❌ Error creating thread for message ${message.id}:`, err);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Catchup Summary:');
    console.log(`   Total messages processed: ${messages.size}`);
    console.log(`   Threads created: ${created}`);
    console.log(`   Messages skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(50) + '\n');

    console.log('✨ Catchup complete!');
  } catch (err) {
    console.error('❌ Fatal error during catchup:', err);
    await client.destroy();
    process.exit(1);
  }

  await client.destroy();
  process.exit(0);
}

runCatchup().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
