import { DateTime } from 'luxon'; // Necesitarás instalar luxon si no lo tienes: npm install luxon

export async function submitCasoModal(interaction, sheetsInstance, config, userPendingData) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const userTag = interaction.user.tag;

    const pendingData = userPendingData.get(userId);

    if (!pendingData || pendingData.type !== 'caso_modal_pending' || !pendingData.solicitudTipo) {
        await interaction.editReply({ content: 'Esta sumisión de formulario no corresponde a un proceso activo de creación de caso. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
        userPendingData.delete(userId);
        return;
    }

    const pedido = interaction.fields.getTextInputValue('casoPedidoInput');
    const numeroCaso = interaction.fields.getTextInputValue('casoNumeroCasoInput');
    const datosContacto = interaction.fields.getTextInputValue('casoDatosContactoInput');
    const tipoSolicitud = pendingData.solicitudTipo; // Obtenemos el tipo de solicitud del estado pendiente

    const currentTime = DateTime.now().setZone('America/Argentina/Buenos_Aires');
    const fecha = currentTime.toFormat('dd-MM-yyyy');
    const hora = currentTime.toFormat('HH:mm:ss');

    try {
        const rowData = [
            tipoSolicitud,
            pedido,
            numeroCaso,
            datosContacto,
            fecha,
            hora,
            userName, // Asesor
            userTag, // Creado por (tag completo)
            userId, // Creado por (ID)
            'PENDIENTE DE GESTIÓN' // Estado inicial del caso
        ];

        await sheetsInstance.spreadsheets.values.append({
            spreadsheetId: config.spreadsheetIdCasos, // Usa el ID de la hoja de casos
            range: config.sheetRangeCasos, // Usa el rango de la hoja de casos
            valueInputOption: 'RAW',
            resource: {
                values: [rowData],
            },
        });
        console.log(`Caso registrado en Google Sheets para ${userTag}. Pedido: ${pedido}, Tipo: ${tipoSolicitud}`);

        await interaction.editReply({
            content: `✅ Caso de tipo **${tipoSolicitud}** para Pedido **${pedido}** (Número de Caso: ${numeroCaso}) registrado exitosamente.`,
            ephemeral: true
        });

        // Opcional: Notificar en el canal público
        await interaction.channel.send({
            content: `🔔 ¡Nuevo caso registrado por ${interaction.user}! Tipo: **${tipoSolicitud}**, Pedido: **${pedido}**, Caso: ${numeroCaso}.`,
        }).catch(e => console.error("Error al enviar notificación pública de Caso:", e));

    } catch (error) {
        console.error(`Error al registrar Caso para ${userTag} (Pedido ${pedido}, Tipo ${tipoSolicitud}):`, error);
        let errorMessage = `❌ Hubo un error al procesar tu solicitud de caso para el Pedido ${pedido}.`;
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
        } else {
            errorMessage += ` Detalles: ${error.message}`;
        }
        errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

        await interaction.editReply({ content: errorMessage, ephemeral: true });
    } finally {
        userPendingData.delete(userId); // Limpiar el estado pendiente una vez finalizado el proceso del modal
        console.log(`Estado pendiente del usuario ${interaction.user.tag} limpiado.`);
    }
}