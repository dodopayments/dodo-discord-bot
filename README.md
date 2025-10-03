# Dodo Discord Bot

A TypeScript Discord bot that automates introductions for new members. Users complete introduction and "working on" forms to earn the "Dodo Builder" role.

## Features

- Auto-sends introduction prompts to new members
- Dual forms: introduction + work project sharing
- Awards "Dodo Builder" role upon completion
- Creates public threads for work discussions
- Moderator tools: `/ping-intro` and `/clear-dm` commands

## Quick Start

### 1. Setup Discord Bot
- Create bot in [Discord Developer Portal](https://discord.com/developers/applications)
- Enable intents: Server Members, Message Content, Direct Messages
- Ensure bot role is higher than "Dodo Builder" role

### 2. Install & Configure
```bash
git clone <repository-url>
cd dodo-discord-bot
npm install
cp env.example .env
# Edit .env with your Discord credentials
```

### 3. Run
```bash
npm run dev    # Development
npm start      # Production
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Bot token | ✅ |
| `CLIENT_ID` | Bot client ID | ✅ |
| `INTRO_CHANNEL_ID` | #introductions channel | ✅ |
| `WORKING_ON_CHANNEL_ID` | #working-on channel | ✅ |
| `MOD_ROLE_ID` | Moderator role ID | ✅ |
| `DODO_BUILDER_ROLE_ID` | Builder role ID | ✅ |
| `GUILD_ID` | Guild ID (optional) | ❌ |

## Commands

- `/ping-intro [user]` - Trigger intro flow (mods only)
- `/clear-dm` - Clear bot DMs (all users)

## Docker

```bash
docker build -t dodo-discord-bot .
docker run --env-file .env dodo-discord-bot
```

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Development with auto-reload
```

## Troubleshooting

- **Bot not responding**: Check env vars and permissions
- **DMs not sent**: Users need DMs enabled from server members
- **Commands not working**: Verify bot permissions and role hierarchy
