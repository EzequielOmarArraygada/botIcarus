import { SlashCommandBuilder } from 'discord.js'; // Asegúrate de importar SlashCommandBuilder
import { getAndreaniTracking } from '../../utils/andreani.js';

// Define la data del comando
export const data = new SlashCommandBuilder()
    .setName('andreani')
    .setDescription('Consulta el estado de seguimiento de un paquete de Andreani.')
    .addStringOption(option =>
        option.setName('numero_seguimiento')
            .setDescription('El número de seguimiento de Andreani')
            .setRequired(true));

export async function execute(interaction, config) { // Cambiado a 'execute'
    await interaction.deferReply();

    const trackingNumber = interaction.options.getString('numero_seguimiento');

    if (!trackingNumber) {
        await interaction.editReply({ content: 'Por favor, proporciona un número de seguimiento.', ephemeral: true });
        return;
    }

    try {
        const trackingData = await getAndreaniTracking(trackingNumber, config.andreaniAuthHeader);

        let responseMessage = `**Estado de Seguimiento Andreani para ${trackingNumber}:**\n`;

        if (trackingData && trackingData.historialEstado && trackingData.historialEstado.length > 0) {
            trackingData.historialEstado.forEach(estado => {
                responseMessage += `\n- **Fecha:** ${estado.fecha || 'N/A'}\n`;
                responseMessage += `  **Estado:** ${estado.estado || 'N/A'}\n`;
                responseMessage += `  **Sucursal:** ${estado.sucursal || 'N/A'}\n`;
            });
        } else {
            responseMessage += 'No se encontró información de seguimiento o el número es incorrecto.';
        }

        await interaction.editReply(responseMessage);

    } catch (error) {
        console.error(`Error al consultar Andreani para ${trackingNumber}:`, error);
        await interaction.editReply({ content: '❌ Hubo un error al consultar el seguimiento de Andreani. Por favor, verifica el número e inténtalo de nuevo.', ephemeral: true });
    }
}