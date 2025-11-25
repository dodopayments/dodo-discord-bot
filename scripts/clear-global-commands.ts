import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function clearGlobalCommands() {
    try {
        console.log('Started clearing application (/) commands globally.');

        // passing an empty array to set the commands to nothing
        await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: [] });

        console.log('Successfully reloaded application (/) commands (cleared global).');
    } catch (error) {
        console.error(error);
    }
}

clearGlobalCommands();
