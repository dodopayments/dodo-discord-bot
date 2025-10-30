# Use Node.js 18 Alpine as base image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and config files
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create configs directory
RUN mkdir -p configs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S discord-bot -u 1001

# Change ownership of the app directory
RUN chown -R discord-bot:nodejs /app
USER discord-bot

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is running')" || exit 1

# Start the bot
CMD ["node", "dist/src/index.js"]
