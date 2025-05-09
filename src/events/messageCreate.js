// Importa las funciones de utilidad y otras variables necesarias
// import { findOrCreateDriveFolder, uploadFileToDrive } from '../utils/googleDrive.js';

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
        }


        // --- Lógica para recibir archivos adjuntos (solo para Factura A) ---
        // Restringir la recepción de adjuntos al canal de Factura A (si está configurado y es diferente al canal de ayuda)
        if (config.targetChannelIdFacA && message.channelId !== config.targetChannelIdFacA && message.channelId !== config.helpChannelId) {
             return;
        }

        const userId = message.author.id;
        const pendingData = userPendingData.get(userId);

        // Verificar si el usuario está esperando adjuntos Y si el dato pendiente es de tipo 'facturaA'
        if (pendingData && pendingData.type === 'facturaA' && message.attachments.size > 0) {
            console.log(`Usuario ${message.author.tag} está esperando adjuntos para el pedido ${pendingData.pedido} (Factura A). Procesando...`);

            // Eliminar al usuario del estado de espera inmediatamente
            userPendingData.delete(userId);

            // --- Procesar y subir archivos a Google Drive ---
            let driveFolderLink = null;

            try {
                if (!config.parentDriveFolderId) { // Usamos config.parentDriveFolderId
                     console.warn("PARENT_DRIVE_FOLDER_ID no configurado. No se subirán archivos adjuntos.");
                     await message.reply({ content: '⚠️ No se pudo subir los archivos adjuntos: La carpeta de destino en Google Drive no está configurada en el bot.', ephemeral: true });
                     return;
                }

                console.log(`Iniciando subida de ${message.attachments.size} archivos a Google Drive para el pedido ${pendingData.pedido}...`);

                const driveFolderName = `FacturaA_Pedido_${pendingData.pedido}`.replace(/[\/\\]/g, '_');

                // Usar la función importada y pasar la instancia de drive
                const folderId = await findOrCreateDriveFolder(driveInstance, config.parentDriveFolderId, driveFolderName); // <-- Pasar driveInstance y config.parentDriveFolderId

                const uploadPromises = Array.from(message.attachments.values()).map(attachment =>
                    // Usar la función importada y pasar la instancia de drive
                    uploadFileToDrive(driveInstance, folderId, attachment) // <-- Pasar driveInstance
                );

                const uploadedFiles = await Promise.all(uploadPromises);
                console.log(`Archivos subidos a Drive: ${uploadedFiles.map(f => f.name).join(', ')}`);

                if (folderId) {
                     try {
                        // Usar la instancia de drive pasada
                        const folderMeta = await driveInstance.files.get({ // <-- Usar driveInstance
                           fileId: folderId,
                           fields: 'webViewLink'
                        });
                        driveFolderLink = folderMeta.data.webViewLink;
                     } catch (linkError) {
                        console.error("Error al obtener el enlace de la carpeta de Drive:", linkError);
                        driveFolderLink = "Enlace no disponible.";
                     }
                }

                let confirmationMessage = `✅ Se ${message.attachments.size === 1 ? 'subió' : 'subieron'} ${message.attachments.size} ${message.attachments.size === 1 ? 'archivo' : 'archivos'} a Google Drive para el Pedido ${pendingData.pedido} (Factura A).`;
                if (driveFolderLink) {
                     confirmationMessage += `\nCarpeta: ${driveFolderLink}`;
                }

                await message.reply({ content: confirmationMessage, ephemeral: true });
                console.log('Confirmación de subida de archivos enviada.');

            } catch (error) {
                console.error('Error durante la subida de archivos a Drive (Factura A):', error);
                let errorMessage = `❌ Hubo un error al subir los archivos adjuntos para el Pedido ${pendingData.pedido} (Factura A).`;
                 if (error.response && error.response.data) {
                      if (error.response.data.error && error.response.data.error.message) {
                           errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                      } else if (error.response.data.error && Array.isArray(error.response.data.error.errors) && error.response.data.error.errors.length > 0 && error.response.data.error.errors[0].message) {
                           errorMessage += ` Error de Google API: ${error.response.data.error.errors[0].message}`;
                      } else {
                           errorMessage += ` Error de Google API: ${error.response.status} ${error.response.statusText}`;
                      }
                 } else {
                      errorMessage += ` Detalles: ${error.message}`;
                 }
                 errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

                await message.reply({ content: errorMessage, ephemeral: true });
                console.log('Mensaje de error de subida de archivos enviado.');
            }

        } else if (message.attachments.size > 0) {
             console.log(`Mensaje con adjuntos recibido de ${message.author.tag}, pero no está en estado de espera. Ignorando adjuntos.`);
        } else {
        }
    });
};
