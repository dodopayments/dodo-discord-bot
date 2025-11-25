/**
 * Embed builders with Dodo Payments branding
 */

import { EmbedBuilder } from 'discord.js';
import { COLORS, EMOJI, FOOTER } from './constants.js';


/**
 * Create base embed with Dodo branding
 */
export function createBaseEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY_GREEN)
        .setFooter({ text: FOOTER.DEFAULT })
        .setTimestamp();
}

/**
 * Welcome embed for new members (sent in DM)
 */
export function createWelcomeEmbed(userId: string, guildName: string): EmbedBuilder {
    return createBaseEmbed()
        .setTitle(`${EMOJI.WAVE} Welcome to ${guildName}!`)
        .setDescription(
            `Hey <@${userId}>,\n\n` +
            `Welcome to **Dodo Payments** — home for builders shipping great products.\n\n` +
            `**${EMOJI.ROCKET} Quick Start (≈60s)**\n` +
            `> ${EMOJI.INTRO} Fill your **Introduction** — who you are\n` +
            `> ${EMOJI.WORKING} Share **What You're Working On** — your current project\n\n` +
            `**${EMOJI.TROPHY} Reward**\n` +
            `> Complete both forms to earn the **Dodo Builder** role!\n\n` +
            `**${EMOJI.BELL} Note**\n` +
            `> Your answers will be posted publicly — no sensitive info please.\n\n` +
            `Let's build great things together! ${EMOJI.FIRE}`
        )
        .setColor(COLORS.PRIMARY_GREEN);
}

/**
 * Introduction embed (posted in channel)
 */
export function createIntroEmbed(name: string, userId: string, about: string): EmbedBuilder {
    const variations = [
        { title: `Welcome to the Dodo family, ${name}!`, section: `About ${name}:` },
        { title: `Hey there, ${name}!`, section: `Get to know ${name}:` },
        { title: `A warm welcome to ${name}!`, section: `Meet ${name}:` },
        { title: `Welcome aboard, ${name}!`, section: `About ${name}:` },
    ];

    const variation = variations[Math.floor(Math.random() * variations.length)];

    return createBaseEmbed()
        .setTitle(`${EMOJI.TADA} New Introduction`)
        .setDescription(
            `**${variation.title}** <@${userId}>\n\n` +
            `__${variation.section}__\n` +
            `> ${about}`
        )
        .setColor(COLORS.PRIMARY_GREEN);
}

/**
 * Working-on project embed (posted in channel)
 */
export function createWorkingEmbed(projectName: string, userId: string, about: string): EmbedBuilder {
    const variations = [
        { title: `New project: ${projectName}`, section: 'About this project:' },
        { title: `Building: ${projectName}`, section: 'Project details:' },
        { title: `Work in progress: ${projectName}`, section: "What it's about:" },
        { title: `Project spotlight: ${projectName}`, section: 'Project overview:' },
    ];

    const variation = variations[Math.floor(Math.random() * variations.length)];

    return createBaseEmbed()
        .setTitle(`${EMOJI.WORKING} New Project`)
        .setDescription(
            `**${variation.title}** <@${userId}>\n\n` +
            `__${variation.section}__\n` +
            `> ${about}`
        )
        .setColor(COLORS.DARK_GREEN);
}

/**
 * Reminder embed (for incomplete intro)
 */
export function createReminderEmbed(userId: string): EmbedBuilder {
    return createBaseEmbed()
        .setTitle(`${EMOJI.BELL} Friendly Reminder`)
        .setDescription(
            `Hey <@${userId}>! ${EMOJI.WAVE}\n\n` +
            `We noticed you haven't completed your introduction yet.\n\n` +
            `Take just **60 seconds** to:\n` +
            `${EMOJI.CHECK} Fill your introduction\n` +
            `${EMOJI.CHECK} Share what you're working on\n\n` +
            `Earn the **Dodo Builder** role and join the community! ${EMOJI.ROCKET}`
        )
        .setColor(COLORS.YELLOW);
}

/**
 * Error embed
 */
export function createErrorEmbed(message: string): EmbedBuilder {
    return createBaseEmbed()
        .setTitle(`${EMOJI.CROSS} Error`)
        .setDescription(message)
        .setColor(COLORS.RED);
}

/**
 * Success embed
 */
export function createSuccessEmbed(message: string): EmbedBuilder {
    return createBaseEmbed()
        .setTitle(`${EMOJI.CHECK} Success`)
        .setDescription(message)
        .setColor(COLORS.PRIMARY_GREEN);
}
