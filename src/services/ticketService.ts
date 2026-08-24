import {
    Client,
    TextChannel,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    OverwriteType,
    CommandInteraction,
    ButtonInteraction,
} from 'discord.js';

export class TicketService {
    public initialize(client: Client) {
        this.setupTicketChannel(client);
        this.startCleanupInterval(client);
    }

    private async setupTicketChannel(client: Client) {
        if (!process.env.NEW_TICKET_TEXT_CHANNEL_ID) return;

        try {
            const ticketChannel = await client.channels.fetch(process.env.NEW_TICKET_TEXT_CHANNEL_ID) as TextChannel;
            if (ticketChannel) {
                const messages = await ticketChannel.messages.fetch({ limit: 1 });
                if (messages.size === 0) {
                    const btn = new ButtonBuilder()
                        .setCustomId('create_ticket_btn')
                        .setLabel('🎫 Create ticket')
                        .setStyle(ButtonStyle.Primary);
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

                    const setupEmbed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle('Support Tickets (Beta)')
                        .setDescription('To create a new support ticket, click the "🎫 Create ticket" button below. Please include your business id (that can be found via Dashboard > Settings) if you have a query/issue regarding your Dodo Payments account.');

                    await ticketChannel.send({
                        embeds: [setupEmbed],
                        components: [row]
                    });
                    console.log('Sent ticket creation button to the new ticket channel.');
                }
            }
        } catch (err) {
            console.error('Failed to setup ticket creation channel:', err);
        }
    }

    private startCleanupInterval(client: Client) {
        const checkClosedTickets = async () => {
            if (!process.env.TICKETS_CATEGORY_ID || !process.env.GUILD_ID) return;
            try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                if (!guild) return;
                const category = await guild.channels.fetch(process.env.TICKETS_CATEGORY_ID);
                if (!category || category.type !== ChannelType.GuildCategory) return;

                // Check all children in this category
                for (const [_id, channel] of category.children.cache) {
                    if (channel.type === ChannelType.GuildText && channel.name.startsWith('ticket-closed-')) {
                        const timestampStr = channel.name.replace('ticket-closed-', '');
                        const timestamp = parseInt(timestampStr, 10);
                        if (!isNaN(timestamp) && Date.now() >= timestamp) {
                            try {
                                await channel.delete();
                                console.log(`Deleted expired ticket channel: ${channel.name}`);
                            } catch (e) {
                                console.error(`Failed to delete expired ticket channel ${channel.name}:`, e);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error in closed tickets check:', e);
            }
        };

        checkClosedTickets();
        setInterval(checkClosedTickets, 60 * 60 * 1000); // Check every hour
    }

    public async handleButtonInteraction(interaction: ButtonInteraction) {
        if (interaction.customId === 'create_ticket_btn') {
            if (process.env.TICKETS_CATEGORY_ID && interaction.guild) {
                const category = interaction.guild.channels.cache.get(process.env.TICKETS_CATEGORY_ID);
                if (category && category.type === ChannelType.GuildCategory) {
                    const existingTicket = category.children.cache.find(c => {
                        if (c.type !== ChannelType.GuildText) return false;
                        if (!c.name.startsWith('ticket-')) return false;
                        if (c.name.startsWith('ticket-closed-')) return false;

                        const overwrite = c.permissionOverwrites.cache.get(interaction.user.id);
                        return overwrite ? overwrite.allow.has(PermissionFlagsBits.SendMessages) : false;
                    });

                    if (existingTicket) {
                        await interaction.reply({
                            content: `You already have a ticket open (<#${existingTicket.id}>). Please post your query/issue there or close that ticket first in order to be able to create a new ticket.`,
                            ephemeral: true
                        });
                        return true;
                    }
                }
            }

            const modal = new ModalBuilder()
                .setCustomId('create_ticket_modal')
                .setTitle('Create a Ticket');

            const busIdInput = new TextInputBuilder()
                .setCustomId('ticket_bus_id')
                .setLabel('Business ID (add if required)')
                .setPlaceholder('bus_...')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const issueInput = new TextInputBuilder()
                .setCustomId('ticket_issue')
                .setLabel('Question/issue')
                .setPlaceholder('Post your query/issue here')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(busIdInput);
            const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(issueInput);

            await interaction.showModal(modal.addComponents(row1, row2));
            return true;
        }
        return false;
    }

    public async handleModalSubmit(interaction: ModalSubmitInteraction) {
        if (interaction.customId === 'create_ticket_modal') {
            const busId = interaction.fields.getTextInputValue('ticket_bus_id');
            const issue = interaction.fields.getTextInputValue('ticket_issue');

            if (!process.env.TICKETS_CATEGORY_ID) {
                await interaction.reply({ content: 'TICKETS_CATEGORY_ID is not configured.', ephemeral: true });
                return true;
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const guild = interaction.guild;
                if (!guild) throw new Error('Guild not found');

                const ticketChannel = await guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: process.env.TICKETS_CATEGORY_ID,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone.id,
                            type: OverwriteType.Role,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: interaction.user.id,
                            type: OverwriteType.Member,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                        },
                        {
                            id: process.env.MOD_ROLE_ID!,
                            type: OverwriteType.Role,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                        },
                        {
                            id: interaction.client.user!.id,
                            type: OverwriteType.Member,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
                        }
                    ],
                });

                const messageContent = `**Business ID:** ${busId || 'Not provided'}\n**Query/Issue:** ${issue}\n\nIf you have any additional information to add, please post it below.`;

                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setDescription(messageContent);

                await ticketChannel.send({ content: `Created by: <@${interaction.user.id}>`, embeds: [embed] });
                await interaction.editReply({ content: `Your ticket has been created: <#${ticketChannel.id}>` });
            } catch (err) {
                console.error('Failed to create ticket:', err);
                await interaction.editReply({ content: 'Failed to create ticket.' });
            }
            return true;
        }
        return false;
    }

    public async handleCommand(interaction: CommandInteraction) {
        if (interaction.commandName === 'close') {
            if (!interaction.guild) return true;

            const channel = interaction.channel;
            if (!channel || !('parentId' in channel)) {
                await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: true });
                return true;
            }

            if (channel.parentId !== process.env.TICKETS_CATEGORY_ID) {
                await interaction.reply({ content: 'You can only use this command inside a ticket channel.', ephemeral: true });
                return true;
            }

            await interaction.reply({ content: 'Closing ticket...' });
            try {
                const deleteAt = Date.now() + (3 * 24 * 60 * 60 * 1000); // 3 days
                await (channel as TextChannel).setName(`ticket-closed-${deleteAt}`);

                // Remove SendMessages access for the user who opened it, but keep ViewChannel
                const overwrites = (channel as TextChannel).permissionOverwrites.cache;
                for (const [id, overwrite] of overwrites) {
                    if (overwrite.type === OverwriteType.Member && id !== interaction.client.user!.id) {
                        await (channel as TextChannel).permissionOverwrites.edit(id, {
                            SendMessages: false,
                            ViewChannel: true
                        });
                    }
                }

                await interaction.editReply({ content: 'Ticket closed and locked. It will be permanently deleted in 3 days.' });
            } catch (err) {
                console.error('Failed to close ticket:', err);
                await interaction.editReply({ content: 'Failed to close the ticket.' });
            }
            return true;
        }
        return false;
    }
}

export const ticketService = new TicketService();
