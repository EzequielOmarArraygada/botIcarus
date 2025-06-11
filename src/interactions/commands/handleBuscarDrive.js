import { checkIfPedidoExists } from '../../utils/googleSheets.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function handleBuscarDriveCommand(interaction, sheetsInstance, config) {
    if (interaction.channelId !== config.targetChannelIdBuscarCaso) {
        await interaction.reply({
            content: `❌ Este comando solo puede ser usado en el canal <#${config.targetChannelIdBuscarCaso}>.`,
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const pedido = interaction.options.getString('pedido');
    if (!pedido) {
        await interaction.editReply({ content: 'Por favor, proporciona un número de pedido.', ephemeral: true });
        return;
    }

    try {
        // Asegúrate de que sheetsInstance y config.spreadsheetIdBuscarCaso estén disponibles
        const sheetResponse = await checkIfPedidoExists(sheetsInstance, config.spreadsheetIdBuscarCaso, pedido, config.sheetsToSearch);

        let replyContent;
        if (sheetResponse.found) {
            replyContent = `✅ El pedido **${pedido}** fue encontrado en la hoja **"${sheetResponse.sheetName}"** (fila ${sheetResponse.rowIndex + 1}).\n`;
            if (sheetResponse.driveLink) {
                replyContent += `Enlace a la carpeta de Drive: ${sheetResponse.driveLink}`;
            } else {
                replyContent += 'No se encontró un enlace de Drive asociado en la hoja de cálculo.';
            }

            // Opcional: Si quieres un botón para ir directamente al link
            if (sheetResponse.driveLink) {
                const linkButton = new ButtonBuilder()
                    .setLabel('Ir a la Carpeta de Drive')
                    .setStyle(ButtonStyle.Link)
                    .setURL(sheetResponse.driveLink);

                const row = new ActionRowBuilder().addComponents(linkButton);
                await interaction.editReply({ content: replyContent, components: [row], ephemeral: true });
                return;
            }

        } else {
            replyContent = `❌ El pedido **${pedido}** NO fue encontrado en las hojas de cálculo configuradas.`;
        }

        await interaction.editReply({ content: replyContent, ephemeral: true });

    } catch (error) {
        console.error(`Error al buscar pedido ${pedido} en Google Sheets:`, error);
        await interaction.editReply({
            content: '❌ Hubo un error al buscar el pedido en Google Sheets. Por favor, inténtalo de nuevo más tarde.',
            ephemeral: true
        });
    }
}