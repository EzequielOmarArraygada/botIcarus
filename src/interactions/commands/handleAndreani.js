import { getAndreaniTracking } from '../../utils/andreani.js'; // Ajusta la ruta si es necesario

export async function handleAndreaniCommand(interaction, config) {
    await interaction.deferReply(); // Deferir la respuesta porque la llamada a la API puede tardar

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
        await interaction.editReply({ content: '❌ Hubo un error al consultar el seguimiento de Andreani. Por favor, verifica el número e inténtalo de nuevo más tarde.', ephemeral: true });
    }
}