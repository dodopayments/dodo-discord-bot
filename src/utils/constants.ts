/**
 * Brand and system constants for Dodo Payments Discord Bot
 */

// ==================== BRAND COLORS ====================
export const COLORS = {
    // Dodo Payments primary brand colors
    PRIMARY_GREEN: 0x10b981, // Emerald-500
    DARK_GREEN: 0x059669,    // Emerald-600
    LIGHT_GREEN: 0x34d399,   // Emerald-400

    // Neutral colors
    DARK_GRAY: 0x1f2937,     // Gray-800
    MEDIUM_GRAY: 0x6b7280,   // Gray-500
    LIGHT_GRAY: 0xd1d5db,    // Gray-300

    // Accent colors
    BLUE: 0x3b82f6,          // Blue-500
    YELLOW: 0xfbbf24,        // Amber-400
    RED: 0xef4444,           // Red-500
    PURPLE: 0xa855f7,        // Purple-500
} as const;

// ==================== EMOJI ====================
export const EMOJI = {
    // General
    WAVE: '👋',
    SPARKLES: '✨',
    ROCKET: '🚀',
    FIRE: '🔥',
    TADA: '🎉',
    TROPHY: '🏆',
    STAR: '⭐',
    CROWN: '👑',

    // Progress
    CHECK: '✅',
    CROSS: '❌',
    LOADING: '⏳',
    BELL: '🔔',

    // Levels
    BRONZE: '🥉',
    SILVER: '🥈',
    GOLD: '🥇',
    DIAMOND: '💎',

    // Activities
    THREAD: '🧵',
    MESSAGE: '💬',
    INTRO: '👤',
    WORKING: '🔧',
    ACHIEVEMENT: '🏅',

    // Stats
    CHART: '📊',
    CALENDAR: '📅',
    CLOCK: '⏰',
} as const;

// ==================== DURATIONS ====================
export const DURATION = {
    // Welcome flow
    WELCOME_DELAY_MS: 60 * 1000, // 60 seconds

    // Reminders
    REMINDER_DELAY_MS: 24 * 60 * 60 * 1000, // 24 hours
    REMINDER_CHECK_INTERVAL: '0 * * * *', // Every hour (cron syntax)

    // Data retention (in days)
    USER_PROGRESS_TTL: 90,
    ANALYTICS_TTL: 365,
    INCOMPLETE_INTRO_TTL: 30,
    REMINDER_RECORD_TTL: 7,

    // Thread archival
    THREAD_ARCHIVE_DURATION: 1440, // 24 hours
} as const;

// ==================== LIMITS ====================
export const LIMITS = {
    // Text input
    MAX_INTRO_LENGTH: 2000,
    MAX_PROJECT_NAME_LENGTH: 100,
    MAX_THREAD_TITLE_LENGTH: 100,

    // Pagination
    LEADERBOARD_PAGE_SIZE: 10,
    STATS_DEFAULT_DAYS: 7,

    // Rate limiting
    MAX_DM_MESSAGES_FETCH: 100,
} as const;

// ==================== GAMIFICATION ====================
export const GAMIFICATION = {
    // Points awarded for actions
    POINTS: {
        INTRO_COMPLETE: 10,
        WORKING_COMPLETE: 10,
        FIRST_THREAD: 5,
        THREAD_REPLY: 2,
        HELPFUL_REACTION: 1,
        DAILY_ACTIVE: 1,
    },

    // Level thresholds
    LEVELS: {
        BRONZE: { min: 0, max: 49, name: 'Bronze Dodo Builder', emoji: EMOJI.BRONZE },
        SILVER: { min: 50, max: 199, name: 'Silver Dodo Builder', emoji: EMOJI.SILVER },
        GOLD: { min: 200, max: 499, name: 'Gold Dodo Builder', emoji: EMOJI.GOLD },
        DIAMOND: { min: 500, max: Infinity, name: 'Diamond Dodo Builder', emoji: EMOJI.DIAMOND },
    },

    // Achievement IDs
    ACHIEVEMENTS: {
        FIRST_INTRO: 'first_intro',
        FIRST_THREAD: 'first_thread',
        HELPFUL_10: 'helpful_10',
        STREAK_7: 'streak_7',
        STREAK_30: 'streak_30',
        LEVEL_SILVER: 'level_silver',
        LEVEL_GOLD: 'level_gold',
        LEVEL_DIAMOND: 'level_diamond',
    },
} as const;

// ==================== MESSAGES ====================
export const MESSAGES = {
    ERRORS: {
        NO_PERMISSION: '❌ You don\'t have permission to use this command.',
        DM_DISABLED: '⚠️ Could not send you a DM. Please enable DMs from server members.',
        SERVER_ONLY: '❌ This command can only be used in a server.',
        ALREADY_COMPLETED: '✅ You\'ve already completed this form!',
        UNKNOWN_ERROR: '❌ An unexpected error occurred. Please try again later.',
    },

    SUCCESS: {
        INTRO_POSTED: '✅ Thanks! Your introduction has been posted publicly in the server.',
        WORKING_POSTED: '✅ Thanks! Your project has been posted in a public thread.',
        BOTH_COMPLETED: '🎉 Congratulations! You completed both forms and earned the Dodo Builder role!',
        DM_CLEARED: '🧹 Cleared all DM messages from this bot.',
    },
} as const;

// ==================== FOOTER TEXT ====================
export const FOOTER = {
    DEFAULT: 'Dodo Payments • Building great products together',
    STATS: 'Stats refreshed every hour',
    LEADERBOARD: 'Keep building to climb the ranks!',
    PROFILE: 'Keep up the great work!',
} as const;

// Helper function to get level from points
export function getLevelFromPoints(points: number): typeof GAMIFICATION.LEVELS[keyof typeof GAMIFICATION.LEVELS] {
    if (points >= GAMIFICATION.LEVELS.DIAMOND.min) return GAMIFICATION.LEVELS.DIAMOND;
    if (points >= GAMIFICATION.LEVELS.GOLD.min) return GAMIFICATION.LEVELS.GOLD;
    if (points >= GAMIFICATION.LEVELS.SILVER.min) return GAMIFICATION.LEVELS.SILVER;
    return GAMIFICATION.LEVELS.BRONZE;
}

// Helper function to format duration
export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}
