import { findOrCreateDriveFolder, uploadFileToDrive } from '../../utils/googleDrive.js';
import { DateTime } from 'luxon'; // Necesitarás instalar luxon si no lo tienes: npm install luxon

export async function submitFacturaAModal(interaction, sheetsInstance, config, userPendingData, driveInstance) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const userTag = interaction.user.tag;

    const pendingData = userPendingData.get(userId);

    if (!pendingData || pendingData.type !== 'facturaA_modal_pending') {
        await interaction.editReply({ content: 'Esta sumisión de formulario no corresponde a un proceso activo. Por favor, usa el comando /factura-a para empezar.', ephemeral: true });
        userPendingData.delete(userId); // Limpiar estado inconsistente
        return;
    }

    const pedido = interaction.fields.getTextInputValue('pedidoInput');
    const caso = interaction.fields.getTextInputValue('casoInput');
    const email = interaction.fields.getTextInputValue('emailInput');
    const descripcion = interaction.fields.getTextInputValue('descripcionInput');

    const currentTime = DateTime.now().setZone('America/Argentina/Buenos_Aires');
    const fecha = currentTime.toFormat('dd-MM-yyyy');
    const hora = currentTime.toFormat('HH:mm:ss');

    try {
        // 1. Guardar en Google Sheets
        const rowData = [
            pedido,
            caso,
            email,
            descripcion,
            fecha,
            hora,
            userName, // Asesor
            userTag,  // Creado por (tag completo)
            userId,   // Creado por (ID)
            'PENDIENTE DE FACTURA A' // Estado inicial
        ];

        await sheetsInstance.spreadsheets.values.append({
            spreadsheetId: config.spreadsheetIdFacA,
            range: config.sheetRangeFacA,
            valueInputOption: 'RAW',
            resource: {
                values: [rowData],
            },
        });
        console.log(`Solicitud de Factura A registrada en Google Sheets para ${userTag}. Pedido: ${pedido}`);

        // 2. Crear o encontrar carpeta en Drive (se usará en messageCreate para subir adjuntos)
        const parentFolderId = config.googleDriveParentFolderId; // Define esto en tu config.js y .env
        const folderName = `Factura A - Pedido ${pedido}`; // Nombre de la carpeta en Drive
        const driveFolderId = await findOrCreateDriveFolder(driveInstance, parentFolderId, folderName);

        // Actualizar el estado del usuario para indicar que ahora está esperando adjuntos
        userPendingData.set(userId, {
            type: 'facturaA_adjuntos_pending',
            pedido: pedido,
            caso: caso,
            email: email,
            descripcion: descripcion,
            driveFolderId: driveFolderId,
            channelId: interaction.channelId,
            interactionId: interaction.id // Para futuras referencias
        });

        await interaction.editReply({
            content: `✅ Solicitud de Factura A para Pedido **${pedido}** (Caso ${caso}) registrada. Ahora, por favor, **envía los archivos adjuntos** (PDF/JPG) para esta solicitud en este mismo canal.`,
            ephemeral: true
        });

        // Opcional: Envía un mensaje en el canal público si es relevante
        await interaction.channel.send({
            content: `🔔 ¡Nueva solicitud de Factura A registrada por ${interaction.user}! Pedido: **${pedido}**, Caso: ${caso}. Favor de subir adjuntos.`,
        }).catch(e => console.error("Error al enviar notificación pública de Factura A:", e));

    } catch (error) {
        console.error(`Error al registrar Factura A para ${userTag} (Pedido ${pedido}):`, error);
        let errorMessage = `❌ Hubo un error al procesar tu solicitud de Factura A para el Pedido ${pedido}.`;
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
        } else {
            errorMessage += ` Detalles: ${error.message}`;
        }
        errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

        await interaction.editReply({ content: errorMessage, ephemeral: true });
    } finally {
        // No borramos userPendingData aquí, ya que el siguiente paso es esperar adjuntos.
        // Se borrará después de subir los adjuntos o si el usuario cancela/expira.
    }
}