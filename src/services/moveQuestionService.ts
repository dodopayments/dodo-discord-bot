import { Message, TextChannel, ForumChannel, ChannelType, ChatInputCommandInteraction, GuildMemberRoleManager } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const { MOD_ROLE_ID, GET_HELP_CHANNEL } = process.env as Record<string, string | undefined>;

class MoveQuestionService {
    public async handleMoveCommand(message: Message) {
        const channel = message.channel as TextChannel;

        // 1. Permission check
        if (!message.member?.roles.cache.has(MOD_ROLE_ID!)) {
            // Delete the command message to keep channel clean, if possible
            if (message.deletable) await message.delete().catch(() => { });
            // Send ephemeral-like error message
            const errorMsg = await channel.send(`<@${message.author.id}>, you do not have permission to use this command.`);
            // Auto-delete the error after 5 seconds
            setTimeout(() => errorMsg.delete().catch(() => { }), 5000);
            return;
        }

        // 2. Check if it's a reply
        if (!message.reference || !message.reference.messageId) {
            if (message.deletable) await message.delete().catch(() => { });
            const errorMsg = await channel.send(`<@${message.author.id}>, Please reply to the message you want to move.`);
            setTimeout(() => errorMsg.delete().catch(() => { }), 5000);
            return;
        }

        try {
            // Fetch the replied-to message
            const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);

            if (!referencedMessage) return;

            // Extract the first sentence (max 20 words)
            const cleanContent = referencedMessage.content.replace(/<@!?&?\d+>/g, '').replace(/<#\d+>/g, '').trim();
            const firstSentence = cleanContent.split(/[.!?\n]/)[0].trim() || 'Moved Message';
            const words = firstSentence.split(/\s+/);
            const title = words.length > 20 ? words.slice(0, 20).join(' ') : firstSentence;

            // Format the message
            const formattedContent = `${referencedMessage.content}\n\n— posted by <@${referencedMessage.author.id}>`;

            // Get target channel
            const targetChannel = await message.client.channels.fetch(GET_HELP_CHANNEL!);

            if (!targetChannel) {
                const errorMsg = await channel.send(`Error: Target channel <#${GET_HELP_CHANNEL}> not found.`);
                setTimeout(() => errorMsg.delete().catch(() => { }), 5000);
                return;
            }

            if (targetChannel.type !== ChannelType.GuildForum) {
                const errorMsg = await channel.send(`Error: Target channel <#${GET_HELP_CHANNEL}> is not a forum channel.`);
                setTimeout(() => errorMsg.delete().catch(() => { }), 5000);
                return;
            }

            const forumChannel = targetChannel as ForumChannel;
            const thread = await forumChannel.threads.create({
                name: title.slice(0, 100), // Thread names have max 100 length
                message: { content: formattedContent },
                appliedTags: [process.env.OTHER_TAG_HELP_ID!],
            });
            const postUrl = thread.url;

            // Notify original author in source channel
            await channel.send(`Hey <@${referencedMessage.author.id}>!\n\nWe’ve moved your message to the <#${GET_HELP_CHANNEL}> channel so it’s easier for everyone to assist. You can continue the conversation here: ${postUrl}`);

            // Delete original message and command message
            if (referencedMessage.deletable) await referencedMessage.delete().catch(() => { });
            if (message.deletable) await message.delete().catch(() => { });

        } catch (error) {
            console.error('Error handling move-message command:', error);
            const errorMsg = await channel.send('An error occurred while moving the message.');
            setTimeout(() => errorMsg.delete().catch(() => { }), 5000);
        }
    }

    public async handleMoveInteraction(interaction: ChatInputCommandInteraction) {
        // 1. Permission check
        const memberRoles = interaction.member?.roles as GuildMemberRoleManager | undefined;
        if (!memberRoles?.cache.has(MOD_ROLE_ID!)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }

        const messageId = interaction.options.getString('message_id');
        let referencedMessage: Message | undefined;

        if (messageId) {
            try {
                referencedMessage = await interaction.channel?.messages.fetch(messageId) as Message | undefined;
            } catch (err) { }
        } else {
            // fetch last message not from bot or interaction itself
            try {
                const messages = await interaction.channel?.messages.fetch({ limit: 5 });
                referencedMessage = messages?.find(m => !m.author.bot && m.id !== "" + interaction.id);
            } catch (err) { }
        }

        if (!referencedMessage) {
            await interaction.reply({ content: 'Could not find a valid message to move. Please provide a message ID or ensure there is a recent user message in the channel.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Extract the first sentence (max 20 words)
            const cleanContent = referencedMessage.content.replace(/<@!?&?\d+>/g, '').replace(/<#\d+>/g, '').trim();
            const firstSentence = cleanContent.split(/[.!?\n]/)[0].trim() || 'Moved Message';
            const words = firstSentence.split(/\s+/);
            const title = words.length > 20 ? words.slice(0, 20).join(' ') : firstSentence;

            // Format the message
            const formattedContent = `${referencedMessage.content}\n\n— posted by <@${referencedMessage.author.id}>`;

            // Get target channel
            const targetChannel = await interaction.client.channels.fetch(GET_HELP_CHANNEL!);

            if (!targetChannel) {
                await interaction.editReply({ content: `Error: Target channel <#${GET_HELP_CHANNEL}> not found.` });
                return;
            }

            if (targetChannel.type !== ChannelType.GuildForum) {
                await interaction.editReply({ content: `Error: Target channel <#${GET_HELP_CHANNEL}> is not a forum channel.` });
                return;
            }

            const forumChannel = targetChannel as ForumChannel;
            const thread = await forumChannel.threads.create({
                name: title.slice(0, 100), // Thread names have max 100 length
                message: { content: formattedContent },
                appliedTags: [process.env.OTHER_TAG_HELP_ID!],
            });
            const postUrl = thread.url;

            // Notify original author in source channel
            if (interaction.channel?.isTextBased() && 'send' in interaction.channel) {
                await (interaction.channel as TextChannel).send(`Hey <@${referencedMessage.author.id}>,\n\nWe've moved your message to the <#${GET_HELP_CHANNEL}> channel so it's easier for us to help with your issue. You can continue the conversation here: ${postUrl}`);
            }

            // Delete original message
            if (referencedMessage.deletable) await referencedMessage.delete().catch(() => { });

            await interaction.editReply({ content: 'Message moved successfully.' });

        } catch (error) {
            console.error('Error handling move-message interaction:', error);
            await interaction.editReply({ content: 'An error occurred while moving the message.' });
        }
    }
}

export const moveQuestionService = new MoveQuestionService();