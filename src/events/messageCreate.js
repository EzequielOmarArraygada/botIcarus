import { getUserState, deleteUserState } from '../utils/stateManager.js';

/**
 * Configura el listener para el evento messageCreate.
 * @param {object} client - Instancia del cliente de Discord.
 * @param {Map} userPendingData - Mapa para datos pendientes del usuario.
 * @param {object} config - Objeto de configuración con IDs de canales, IDs de hojas, rangos, etc.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {function} findOrCreateDriveFolder - Función de utilidad de Drive.
 * @param {function} uploadFileToDrive - Función de utilidad de Drive.
 */
export default (client, userPendingData, config, driveInstance, findOrCreateDriveFolder, uploadFileToDrive) => {
    client.on('messageCreate', async message => {
        // Ignorar mensajes de bots
        if (message.author.bot) {
            return;
        }

        if (config.targetCategoryId && message.channel.parentId !== config.targetCategoryId) {
    return; // Ignora el mensaje
}

        const messageContentLower = message.content.toLowerCase();

        // --- Lógica para responder a preguntas sobre comandos en el canal de ayuda ---
        if (config.helpChannelId && message.channelId === config.helpChannelId) { // Usamos config.helpChannelId
            // Si el mensaje contiene las palabras clave para Factura A
            if (messageContentLower.includes('factura-a') || messageContentLower.includes('factura a') || messageContentLower.includes('facturaa') || messageContentLower.includes('solicitud')) {
                const helpMessage = `
Para usar el comando **/factura-a**:

Este comando abre un formulario (Modal) para registrar una nueva solicitud de Factura A.

1.  Escribe \`/factura-a\` en el canal [menciona el canal si aplica, ej: <#${config.targetChannelIdFacA || 'ID_CANAL_FACTURA_A'}>].
2.  Completa los datos solicitados en el formulario que aparecerá (Número de Pedido, Número de Caso, Email del Cliente, Detalle de la Solicitud).
3.  Haz clic en "Enviar".
4.  Si necesitas adjuntar archivos para esta solicitud, envíalos en un **mensaje SEPARADO** aquí mismo en este canal [o menciona el canal de Factura A si es diferente].
`;
                await message.reply({ content: helpMessage, ephemeral: false });
                return; // Salir del listener después de responder
            }

            // Si el mensaje contiene la palabra "tracking" Y NO contuvo palabras clave de Factura A
            if (messageContentLower.includes('tracking') && !messageContentLower.includes('factura')) {
                 const helpMessage = `
Para usar el comando **/tracking**:

Este comando te permite consultar el estado actual de un envío de Andreani.

1.  Escribe \`/tracking numero:\` seguido del número de seguimiento de Andreani.
2.  Ejemplo: \`/tracking numero: ABC123456789\`
3.  El bot responderá con el estado actual y el historial del envío.
`;
                await message.reply({ content: helpMessage, ephemeral: false });
                return; // Salir del listener después de responder
            }

            // Si el mensaje contiene las palabras clave para Buscar Caso
            if (messageContentLower.includes('buscar caso')) {
                 const helpMessage = `
Para usar el comando **/buscar-caso**:

Este comando te permite buscar casos por Número de Pedido en las hojas de Google Sheets configuradas.

1.  Escribe \`/buscar-caso pedido:\` seguido del número de pedido que quieres buscar.
2.  Ejemplo: \`/buscar-caso pedido: 12345\`
3.  El bot buscará en las pestañas configuradas y te mostrará las filas encontradas.
`;
                await message.reply({ content: helpMessage, ephemeral: false });
                return; // Salir del listener después de responder
            }


            // Si el mensaje contiene la palabra "caso" o "devolucion" o "cambio" o "agregar" (y no fue manejado por "buscar caso")
            if (messageContentLower.includes('caso') || messageContentLower.includes('devolucion') || messageContentLower.includes('cambio') || messageContentLower.includes('agregar')) {
                let helpMessage = `
Para usar el comando **/agregar-caso**:

Este comando inicia el proceso para registrar un nuevo caso de cambio o devolución.

1.  Escribe \`/agregar-caso\` **únicamente** en el canal <#${config.targetChannelIdCasos || 'ID_CANAL_CASOS'}>.
2.  El bot te enviará un mensaje con un desplegable para que elijas el **Tipo de Solicitud**.
3.  Después de elegir el tipo, haz clic en el botón "Completar Detalles" que aparecerá.
4.  El bot te presentará un formulario (Modal) para completar los demás datos (Número de Pedido, Número de Caso, Dirección/Teléfono/Datos).
5.  Completa el formulario y haz clic en "Enviar".
`;
                await message.reply({ content: helpMessage, ephemeral: false });
                return; // Salir del listener después de responder
            }
            if (messageContentLower.includes('comandos') || messageContentLower.includes('funciones') || messageContentLower.includes('como') ) {
                const helpMessage = `
Lista de comandos:

    # /factura-a  -  Este comando es para generar una solicitud de factura A.
    # /trackig - Este comando sirve para buscar información de un trackign de Andreani.
    # /buscar-caso - Este comando sirve para buscar un caso cargado en nuestra sheet con el número de pedido.
    # /agregar-caso - Este comando sirve para agregar un caso a la pestaña de SOLICITUDES BGH 2025 de nuestra sheet.
`;
                await message.reply({ content: helpMessage, ephemeral: false });
                return; // Salir del listener después de responder
            }
        
}

        // --- Lógica para recibir archivos adjuntos (solo para Factura A) ---
        // Restringir la recepción de adjuntos al canal de Factura A (si está configurado y es diferente al canal de ayuda)
        if (config.targetChannelIdFacA && message.channelId !== config.targetChannelIdFacA && message.channelId !== config.helpChannelId) {
             return;
        }

        const userId = message.author.id;
        const pendingData = await getUserState(userId);

        if (pendingData && pendingData.type === 'facturaA' && message.attachments.size > 0) {
            console.log(`Usuario ${message.author.tag} está esperando adjuntos para el pedido ${pendingData.pedido} (${pendingData.type}). Procesando...`);

            // *** Estos logs de depuración son útiles, puedes mantenerlos por ahora ***
            console.log(`[DEBUG - messageCreate] pendingData.targetDriveFolderId: ${pendingData.targetDriveFolderId}`);
            // console.log(`[DEBUG - messageCreate] config.parentDriveFolderId: ${config.parentDriveFolderId}`); // Este ya sabemos que será 'undefined' aquí, puedes quitarlo.

            if (!pendingData.targetDriveFolderId) {
                console.log("PARENT_DRIVE_FOLDER_ID no configurado. No se subirán archivos adjuntos.");
                await message.reply({ content: "❌ Error: No se pudo determinar la carpeta de destino en Google Drive. Por favor, contacta a un administrador.", ephemeral: true });
                // No retornar aquí si quieres que el deleteUserState se ejecute.
                // Podrías retornar si quieres detener el procesamiento en este punto de error crítico.
                return; // Añadido un return para detener el flujo en caso de error.
            }

            try {
                for (const [attachmentId, attachment] of message.attachments) {
                    console.log(`Procesando adjunto: ${attachment.name}, URL: ${attachment.url}`);

                    // AQUI ES DONDE SE LLAMA A uploadFileToDrive
                    const uploadedFile = await uploadFileToDrive(driveInstance, attachment, pendingData.pedido, pendingData.targetDriveFolderId);
                    console.log(`Adjunto ${attachment.name} subido a Drive con ID: ${uploadedFile.id}`);
                }

                await message.reply({ content: `✅ Archivos para el pedido **${pendingData.pedido}** subidos a Google Drive correctamente.`, ephemeral: true });
                console.log(`Archivos del pedido ${pendingData.pedido} subidos a Drive y confirmación enviada.`);
                await deleteUserState(userId);
                console.log(`Estado pendiente del usuario ${message.author.tag} limpiado para el pedido ${pendingData.pedido}.`);

            } catch (error) {
                console.error(`Error al subir adjuntos para el pedido ${pendingData.pedido}:`, error);
                let errorMessage = `❌ Hubo un error al subir los archivos adjuntos para el Pedido ${pendingData.pedido} (Factura A).`;
                // ... (tu manejo de errores)
                await message.reply({ content: errorMessage, ephemeral: true });
                console.log('Mensaje de error de subida de archivos enviado.');
            }

        } else if (message.attachments.size > 0) {
             console.log(`Mensaje con adjuntos recibido de ${message.author.tag}, pero no está en estado de espera. Ignorando adjuntos.`);
        } else {
            // Lógica para el manual si no hay adjuntos y no hay estado pendiente
            if (config.manualDriveFileId && config.geminiApiKey) {
                // ... (Tu código actual para el manual)
            }
        }
    });
};