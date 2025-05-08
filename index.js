// Cargar variables de entorno del archivo .env (forma para Módulos ES)
import 'dotenv/config';

// --- Importaciones ---
// Importaciones de discord.js
import {
    Client,
    GatewayIntentBits,
    ModalBuilder,       // Para construir el modal
    TextInputBuilder,   // Para construir campos de texto en el modal
    ActionRowBuilder,    // Para organizar componentes en el modal
    ApplicationCommandOptionType // Importar ApplicationCommandOptionOptionType para obtener opciones de comandos
} from 'discord.js';

// Importaciones de Google APIs y utilidades
import { google } from 'googleapis'; // Librería oficial de Google
import path from 'path';              // Módulo nativo para manejo de rutas
import fetch from 'node-fetch';       // Para descargar archivos adjuntos desde URL (Importación estándar ESM)

// No necesitamos cheerio para el tracking de Andreani ya que la API devuelve JSON
// import * as cheerio from 'cheerio';


// --- Configuración del Cliente de Discord ---
// Aquí se crea la instancia principal del bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,         // Necesario para reconocer servidores y comandos
        GatewayIntentBits.GuildMessages,  // Necesario para el listener messageCreate
        GatewayIntentBits.MessageContent, // CRUCIAL para leer el contenido de mensajes, incluyendo adjuntos
    ]
});

// --- Variables de Entorno de Discord ---
// Se leen de process.env después de importar 'dotenv/config'
const discordToken = process.env.DISCORD_TOKEN;
// Canales específicos donde se permiten los comandos (usados para la restricción manual)
const targetChannelIdFacA = process.env.TARGET_CHANNEL_ID_FAC_A; // Canal para /solicitud
const targetChannelIdEnvios = process.env.TARGET_CHANNEL_ID_ENVIOS; // Canal para /tracking
const guildId = process.env.GUILD_ID; // Necesitamos el ID del servidor también para permisos (aunque no se use para permisos automáticos ahora)
const helpChannelId = process.env.HELP_CHANNEL_ID; // ID del canal de ayuda/explicaciones


// --- Variables de Entorno para IDs de Comandos ---
// ¡Necesitarás obtener estos IDs después de desplegar los comandos!
// Configura estas variables de entorno en Railway.
const commandIdSolicitud = process.env.COMMAND_ID_SOLICITUD; // ID numérico del comando /solicitud (no usado en este código, pero se mantiene)
const commandIdTracking = process.env.COMMAND_ID_TRACKING;   // ID numérico del comando /tracking (no usado en este código, pero se mantiene)
const andreaniAuthHeader = process.env.ANDREANI_API_AUTH; // Encabezado de autorización para Andreani API


// --- Configuración de Google Sheets Y Google Drive ---

// DECLARACIÓN DE LA VARIABLE credentials
let credentials;

// --- Lógica para cargar credenciales SOLAMENTE desde GOOGLE_CREDENTIALS_JSON ---
// Este bloque asume que SIEMPRE usarás la variable GOOGLE_CREDENTIALS_JSON en el entorno (Railway)
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        // Parsear el contenido del JSON desde la variable de entorno
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        console.log("Credenciales de Google cargadas desde variable de entorno GOOGLE_CREDENTIALS_JSON.");
    } catch (error) {
        console.error("Error CRÍTICO: Error al parsear la variable de entorno GOOGLE_CREDENTIALS_JSON. Asegúrate de que su valor es un JSON válido.", error);
        // Salir del proceso si las credenciales no se pueden parsear
        process.exit(1);
    }
} else {
    // Si la variable GOOGLE_CREDENTIALS_JSON no está configurada
    console.error("Error CRÍTICO: La variable de entorno GOOGLE_CREDENTIALS_JSON no está configurada.");
     // Salir del proceso si la variable principal no está
    process.exit(1);
}

// Ahora sí, usar 'credentials' que ya debe estar cargada correctamente
const auth = new google.auth.GoogleAuth({
    credentials, // Usamos la variable cargada
    // Asegúrate de incluir scopes para Sheets Y Drive si usas ambas APIs
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets', // Permiso para Sheets
        'https://www.googleapis.com/auth/drive'        // Permiso para Drive (acceso completo)
        // Opcional, si solo necesitas crear/subir archivos de la app: 'https://www.googleapis.com/auth/drive.file'
    ]
});

// Obtenemos instancias de ambas APIs de Google usando la autenticación
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth }); // INSTANCIA DE LA API DE DRIVE


// --- Variables de Entorno de Google Adicionales ---
const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const sheetRange = process.env.GOOGLE_SHEET_RANGE; // Rango donde insertar en Sheets (ej: 'NombrePestaña!A:Z')

// Validaciones básicas para variables de Google
if (!spreadsheetId || !sheetRange) {
    console.error("Error: Faltan variables de entorno para Google Sheets: GOOGLE_SHEET_ID o GOOGLE_SHEET_RANGE.");
    // Decide si quieres salir aquí o continuar sin funcionalidad de Sheets
    // process.exit(1);
}

// Configuración de Google Drive Específica
const parentDriveFolderId = process.env.PARENT_DRIVE_FOLDER_ID; // ID de la carpeta padre en Drive
if (!parentDriveFolderId) {
     console.warn("Advertencia: PARENT_DRIVE_FOLDER_ID no configurado en .env. Los archivos se subirán a la raíz de Drive de la cuenta de servicio si se adjuntan.");
}


// --- Manejo de Estado para Archivos Adjuntos Posteriores ---
// Usaremos un Map para rastrear a los usuarios que han enviado un modal
// y de quienes esperamos archivos adjuntos en el siguiente mensaje.
// Clave: ID del usuario de Discord (string)
// Valor: Un objeto con información de la solicitud, ej: { pedido: '...', timestamp: Date }
const waitingForAttachments = new Map();


// --- Eventos del Bot de Discord ---

// Cuando el bot se conecta exitosamente y está listo
client.once('ready', async () => { // <-- Hacemos la función async para usar await
    console.log(`Bot logeado como ${client.user.tag}!`);
    console.log(`Conectado a Discord.`);

    // --- Lógica para establecer permisos de comandos por canal ---
    // Esta sección ha sido ELIMINADA para evitar el error ApplicationCommandPermissionsTokenMissing.
    // La restricción de comandos ahora dependerá de la lógica manual en interactionCreate.
    // La explicación de comandos por mensaje se restringe al canal de ayuda en messageCreate.

    console.log('Lógica de establecimiento automático de permisos de comandos por canal omitida.');


    // Puedes añadir aquí lógica para verificar que los comandos estén registrados globalmente si quieres, pero ya lo haces con el script deploy-commands.js
});

// --- Manejar Mensajes Normales (para recibir archivos adjuntos Y explicaciones de comandos) ---
client.on('messageCreate', async message => {
    // Ignorar mensajes de bots (incluido el nuestro)
    if (message.author.bot) {
        return;
    }

    // --- Restringir la lógica de explicaciones de comandos al canal de ayuda ---
    // Solo procesar mensajes para explicaciones si provienen del canal de ayuda configurado
    if (helpChannelId && message.channelId === helpChannelId) {
        // Convertir el mensaje a minúsculas para hacer la detección menos sensible a mayúsculas/minúsculas
        const messageContentLower = message.content.toLowerCase();

        // --- Lógica para responder a preguntas sobre comandos ---
        // Ampliamos las frases de detección
        if (
            messageContentLower.includes('como usar /solicitud') ||
            messageContentLower.includes('explicame /solicitud') ||
            messageContentLower === '/solicitud ayuda' ||
            messageContentLower.includes('ayuda solicitud') ||
            messageContentLower.includes('explica solicitud') ||
            messageContentLower.includes('info solicitud') ||
            messageContentLower.includes('que hace /solicitud') || // Nuevas frases
            messageContentLower.includes('para que sirve /solicitud')
        ) {
            const helpMessage = `
Para usar el comando **/solicitud**:

Este comando abre un formulario (Modal) para registrar una nueva solicitud.

1.  Escribe \`/solicitud\` en el canal [menciona el canal si aplica, ej: <#${targetChannelIdFacA || 'ID_CANAL_SOLICITUDES'}>].
2.  Completa los datos solicitados en el formulario que aparecerá (Número de Pedido, Número de Caso, Email del Cliente, Detalle de la Solicitud).
3.  Haz clic en "Enviar".
4.  Si necesitas adjuntar archivos para esta solicitud, envíalos en un **mensaje SEPARADO** aquí mismo en este canal [o menciona el canal de solicitudes si es diferente].
`;
            await message.reply({ content: helpMessage, ephemeral: false }); // ephemeral: false para que todos en el canal de ayuda lo vean
            return; // Salir del listener después de responder
        }

        if (
            messageContentLower.includes('como usar /tracking') ||
            messageContentLower.includes('explicame /tracking') ||
            messageContentLower === '/tracking ayuda' ||
            messageContentLower.includes('ayuda tracking') ||
            messageContentLower.includes('explica tracking') ||
            messageContentLower.includes('info tracking') ||
            messageContentLower.includes('seguimiento andreani') ||
            messageContentLower.includes('que hace /tracking') || // Nuevas frases
            messageContentLower.includes('para que sirve /tracking') ||
            messageContentLower.includes('rastrear envio') ||
            messageContentLower.includes('consultar envio')
        ) {
            const helpMessage = `
Para usar el comando **/tracking**:

Este comando te permite consultar el estado actual de un envío de Andreani.

1.  Escribe \`/tracking numero:\` seguido del número de seguimiento de Andreani.
2.  Ejemplo: \`/tracking numero: ABC123456789\`
3.  El bot responderá con el estado actual y el historial del envío.
`;
            await message.reply({ content: helpMessage, ephemeral: false }); // ephemeral: false para que todos en el canal de ayuda lo vean
            return; // Salir del listener después de responder
        }

        // Si el mensaje está en el canal de ayuda pero no es una pregunta de comando reconocida
        // Puedes añadir una respuesta genérica aquí si quieres, o simplemente ignorarlo.
        // await message.reply({ content: 'No entendí tu pregunta sobre comandos. Intenta preguntar por un comando específico como "/solicitud ayuda" o "/tracking ayuda".', ephemeral: true });
        // return; // Salir del listener
    }


    // --- Lógica existente para recibir archivos adjuntos ---
    // Esta lógica solo se ejecutará si el mensaje no fue una pregunta sobre un comando
    // Y si el mensaje no provino del canal de ayuda (a menos que sea el mismo canal)

    // Opcional: Restringir la recepción de adjuntos al canal de solicitudes (si es diferente al canal de ayuda)
    // Si el canal de ayuda es el mismo que el canal de solicitudes, esta verificación ya se hizo arriba.
    if (targetChannelIdFacA && message.channelId !== targetChannelIdFacA && message.channelId !== helpChannelId) {
         // console.log(`Mensaje recibido fuera de los canales objetivo: ${message.content}`);
         return; // Ignorar mensajes fuera de los canales objetivo para adjuntos
    }

    // Si el mensaje está en el canal de ayuda Y es el mismo que el canal de solicitudes
    // O si el mensaje está en el canal de solicitudes Y no es el canal de ayuda
    // Y si el usuario está esperando adjuntos Y el mensaje tiene adjuntos
    const userId = message.author.id;
    const pendingRequest = waitingForAttachments.get(userId);

    if (pendingRequest && message.attachments.size > 0) {
        console.log(`Usuario ${message.author.tag} está esperando adjuntos para el pedido ${pendingRequest.pedido}. Procesando...`);

        // Eliminar al usuario del estado de espera inmediatamente
        waitingForAttachments.delete(userId);

        // --- Procesar y subir archivos a Google Drive ---
        let driveFolderLink = null; // Para guardar el enlace a la carpeta de Drive

        try {
            // Asegúrate de tener el ID de la carpeta padre de Drive configurado en .env
            if (!parentDriveFolderId) {
                 console.warn("PARENT_DRIVE_FOLDER_ID no configurado. No se subirán archivos adjuntos.");
                 await message.reply({ content: '⚠️ No se pudo subir los archivos adjuntos: La carpeta de destino en Google Drive no está configurada en el bot.', ephemeral: true });
                 return; // Salir si no hay carpeta padre configurada
            }

            console.log(`Iniciando subida de ${message.attachments.size} archivos a Google Drive para el pedido ${pendingRequest.pedido}...`);

            // Nombre de la carpeta en Drive (usar el número de pedido de la solicitud pendiente)
            const driveFolderName = `Pedido_${pendingRequest.pedido}`.replace(/[\/\\]/g, '_');

            // Encontrar o crear la carpeta de destino en Drive
            const folderId = await findOrCreateDriveFolder(drive, parentDriveFolderId, driveFolderName);
            console.log(`Carpeta de Drive (ID: ${folderId}) encontrada o creada para el pedido ${pendingRequest.pedido}.`);

            // Subir cada archivo adjunto a la carpeta encontrada/creada
            const uploadPromises = Array.from(message.attachments.values()).map(attachment =>
                // Llama a la función de ayuda para subir. Asegúrate que uploadFileToDrive usa 'fetch' importado.
                uploadFileToDrive(drive, folderId, attachment)
            );

            // Esperar a que todas las subidas terminen
            const uploadedFiles = await Promise.all(uploadPromises);
            console.log(`Archivos subidos a Drive: ${uploadedFiles.map(f => f.name).join(', ')}`);

            // Intentar obtener el enlace a la carpeta de Drive para la confirmación
            if (folderId) {
                 try {
                    const folderMeta = await drive.files.get({
                       fileId: folderId,
                       fields: 'webViewLink' // Campo que contiene el enlace web
                    });
                    driveFolderLink = folderMeta.data.webViewLink;
                 } catch (linkError) {
                    console.error("Error al obtener el enlace de la carpeta de Drive:", linkError);
                    driveFolderLink = "Enlace no disponible."; // Mensaje si no se pudo obtener el enlace
                 }
            }

            // --- Responder al usuario con la confirmación de la subida ---
            let confirmationMessage = `✅ Se ${message.attachments.size === 1 ? 'subió' : 'subieron'} ${message.attachments.size} ${message.attachments.size === 1 ? 'archivo' : 'archivos'} a Google Drive para el Pedido ${pendingRequest.pedido}.`;
            if (driveFolderLink) {
                 confirmationMessage += `\nCarpeta: ${driveFolderLink}`; // Enlace en nueva línea
            }

            // Responder como un mensaje efímero para no saturar el chat
            await message.reply({ content: confirmationMessage, ephemeral: true });
            console.log('Confirmación de subida de archivos enviada.');


        } catch (error) {
            // --- MANEJO DE ERRORES MEJORADO ---
            console.error('Error durante la subida de archivos a Drive:', error);

            // Construir un mensaje de error detallado para el usuario
            let errorMessage = `❌ Hubo un error al subir los archivos adjuntos para el Pedido ${pendingRequest.pedido}.`;

            // Intentar extraer mensaje de error de Google API si está disponible
            if (error.response && error.response.data) {
                 // Verificar si hay un mensaje de error específico en la respuesta de Google
                 if (error.response.data.error && error.response.data.error.message) {
                      errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                 } else if (error.response.data.error && Array.isArray(error.response.data.error.errors) && error.response.data.error.errors.length > 0 && error.response.data.error.errors[0].message) {
                           // A veces el mensaje está dentro de un array 'errors'
                           errorMessage += ` Error de Google API: ${error.response.data.error.errors[0].message}`;
                 } else {
                      // Si no encontramos un mensaje estructurado, mostramos el status y statusText
                      errorMessage += ` Error de Google API: ${error.response.status} ${error.response.statusText}`;
                 }
            } else {
                 // Si no es un error de respuesta de Google API, mostramos el mensaje general del error
                 errorMessage += ` Detalles: ${error.message}`;
            }
            errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

            // Responder con el mensaje de error
            await message.reply({ content: errorMessage, ephemeral: true });
            console.log('Mensaje de error de subida de archivos enviado.');
        }

    } else if (message.attachments.size > 0) {
         // Si el mensaje tiene adjuntos pero el usuario NO está esperando
         console.log(`Mensaje con adjuntos recibido de ${message.author.tag}, pero no está en estado de espera. Ignorando adjuntos.`);
         // Opcional: Puedes enviar un mensaje discreto al usuario si quieres
         // await message.react('❓'); // Reaccionar con un emoji de pregunta
         // o puedes enviar un mensaje efímero:
         // await message.reply({ content: 'Parece que enviaste archivos adjuntos, pero no estabas en medio de una solicitud. Usa /solicitud primero.', ephemeral: true });
    } else {
        // Si el mensaje no tiene adjuntos y el usuario no está esperando, es un mensaje normal.
        // console.log(`Mensaje normal sin adjuntos de ${message.author.tag}.`);
    }
});


// --- Manejar Interacciones (Comandos de Barra, Sumisiones de Modals, etc.) ---
client.on('interactionCreate', async interaction => {
    if (interaction.user.bot) return; // Ignorar interacciones de bots

    // --- Manejar Comandos de Barra (Slash Commands) ---
    if (interaction.isChatInputCommand()) {
        // Verifica si es nuestro comando "/solicitud"
        if (interaction.commandName === 'solicitud') {
             console.log(`Comando /solicitud recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // --- Restricción de canal (redundante si los permisos están configurados, pero útil como fallback) ---
             if (targetChannelIdFacA && interaction.channelId !== targetChannelIdFacA) {
                  // Este mensaje solo se mostrará si la restricción de permisos de Discord falla por alguna razón
                  await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdFacA}>.`, ephemeral: true });
                  return; // Salir del handler if no es el canal correcto
             }

             // NOTA: Ya NO guardamos attachments aquí, ya que el usuario los enviará después.
             // La lógica de attachments que estaba aquí se ELIMINA.
             console.log('No se esperan archivos adjuntos en el comando inicial.');


            // !!! MOSTRAR EL MODAL DE SOLICITUD !!!
            try {
                const modal = buildSolicitudModal(); // Función que crea el objeto Modal (definida más abajo)
                // showModal() debe ser la respuesta INICIAL a la interacción del comando
                await interaction.showModal(modal);
                console.log('Modal de solicitud mostrado al usuario.');

            } catch (error) {
                console.error('Error al mostrar el modal:', error);
                // Si showModal falla, respondemos con un mensaje de error efímero
                await interaction.reply({ content: 'Hubo un error al abrir el formulario de solicitud. Por favor, inténtalo de nuevo.', ephemeral: true });
                // Si falló el modal, nos aseguramos de que el usuario no quede en un estado de espera (aunque no debería estarlo aún)
                waitingForAttachments.delete(interaction.user.id);
            }
        } else if (interaction.commandName === 'tracking') { // --- MANEJADOR PARA /tracking ---
             console.log(`Comando /tracking recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // --- Restricción de canal (redundante si los permisos están configurados, pero útil como fallback) ---
             if (targetChannelIdEnvios && interaction.channelId !== targetChannelIdEnvios) {
                 // Este mensaje solo se mostrará si la restricción de permisos de Discord falla por alguna razón
                 await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdEnvios}>.`, ephemeral: true });
                 return; // Salir del handler if no es el canal correcto
             }


             // Deferir la respuesta inmediatamente, ya que la consulta a la API puede tardar.
             await interaction.deferReply({ ephemeral: false }); // Puedes hacerlo efímero si prefieres que solo el usuario vea el resultado

             // Obtener el número de tracking de la opción del comando
             const trackingNumber = interaction.options.getString('numero');
             console.log(`Número de tracking recibido: ${trackingNumber}`);

             if (!trackingNumber) {
                 await interaction.editReply({ content: '❌ Debes proporcionar un número de seguimiento.', ephemeral: true });
                 return;
             }

             // --- Lógica para consultar el tracking en Andreani usando la API JSON ---
             let trackingInfo = null; // Variable para guardar la información extraída
             // Usamos la URL de la API JSON que encontraste
             const andreaniApiUrl = `https://tracking-api.andreani.com/api/v1/Tracking?idReceptor=1&idSistema=1&userData=%7B%22mail%22:%22%22%7D&numeroAndreani=${trackingNumber}`;
             console.log(`Consultando API JSON: ${andreaniApiUrl}`);

             try {
                 // --- OBTENER EL ENCABEZADO DE AUTORIZACIÓN DESDE VARIABLES DE ENTORNO ---
                 // Ya verificamos si andreaniAuthHeader existe al inicio del evento ready,
                 // pero lo verificamos de nuevo aquí para estar seguros antes de usarlo.
                 if (!andreaniAuthHeader) {
                      console.error("Error: ANDREANI_API_AUTH no está configurada. No se puede consultar el tracking.");
                       await interaction.editReply({ content: '❌ Error de configuración del bot: La clave de autenticación para Andreani no está configurada.', ephemeral: true });
                       return;
                 }


                 // Definimos los encabezados, incluyendo los que encontramos en la pestaña Network.
                 const headers = {
                     'Accept': 'application/json, text/plain, */*',
                     // Incluimos el encabezado Authorization con el valor de la variable de entorno
                     'Authorization': andreaniAuthHeader, // <-- ¡Usando variable de entorno!
                     'Origin': 'https://www.andreani.com', // Incluimos Origin
                     'Referer': 'https://www.andreani.com/', // Incluimos Referer (adaptado a la página principal de seguimiento si es necesario)
                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36', // Mantener un User-Agent común
                     // Otros encabezados encontrados que podrían ser relevantes:
                     'Accept-Encoding': 'gzip, deflate, br, zstd',
                     'Accept-Language': 'es-419,es;q=0.9',
                     'Connection': 'keep-alive',
                     // 'Host' no suele ser necesario en fetch, lo maneja automáticamente
                     'Sec-Fetch-Dest': 'empty',
                     'Sec-Fetch-Mode': 'cors',
                     'Sec-Fetch-Site': 'same-site',
                     // Los encabezados sec-ch-ua también pueden ser útiles, pero a veces no son estrictamente necesarios
                     'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                     'sec-ch-ua-mobile': '?0',
                     'sec-ch-ua-platform': '"Windows"',
                 };

                 const apiResponse = await fetch(andreaniApiUrl, { headers: headers });

                 if (!apiResponse.ok) {
                     // Si la respuesta HTTP no es 2xx, lanzar un error
                     // Incluimos el status y statusText en el error
                     throw new Error(`Error HTTP al consultar la API de Andreani: ${apiResponse.status} ${apiResponse.statusText}`);
                 }

                 // Parsear la respuesta como JSON
                 const trackingData = await apiResponse.json();
                 console.log("Respuesta de la API JSON recibida y parseada.");
                 // console.log(JSON.stringify(trackingData, null, 2)); // Opcional: log completo del JSON

                 // --- Extraer la información del JSON ---
                 // Verificamos si la respuesta contiene la estructura esperada
                 if (trackingData && trackingData.procesoActual && trackingData.timelines) {
                     const procesoActual = trackingData.procesoActual;
                     const fechaEstimadaDeEntrega = trackingData.fechaEstimadaDeEntrega;
                     const timelines = trackingData.timelines;
                     const numeroAndreani = trackingData.numeroAndreani; // Asegurarnos de usar el número del JSON por si acaso

                     trackingInfo = `📦 Estado del tracking **${numeroAndreani || trackingNumber}**:\n`;
                     trackingInfo += `${procesoActual.titulo}`;

                     // Añadir detalle de fecha si está disponible
                     if (fechaEstimadaDeEntrega) {
                          // Limpiar etiquetas HTML básicas como <b> y <br> del texto
                          const cleanFechaDetalle = fechaEstimadaDeEntrega.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '');
                          trackingInfo += ` - ${cleanFechaDetalle}`;
                     }

                     // Añadir historial de eventos si está disponible
                     if (timelines && timelines.length > 0) {
                         // Ordenar las etapas del timeline por el campo 'orden' de menor a mayor
                         timelines.sort((a, b) => a.orden - b.orden);

                         trackingInfo += '\n\nHistorial:';
                         // Iterar sobre cada timeline (cada etapa principal)
                         for (const timeline of timelines) {
                             if (timeline.traducciones && timeline.traducciones.length > 0) {
                                 // Iterar sobre cada traducción/evento dentro de la etapa
                                 for (const evento of timeline.traducciones) {
                                     const fechaHora = evento.fechaEvento ? new Date(evento.fechaEvento).toLocaleString('es-AR', {
                                         year: 'numeric',
                                         month: '2-digit',
                                         day: '2-digit',
                                         hour: '2-digit',
                                         minute: '2-digit',
                                         hour12: false,
                                         timeZone: 'America/Argentina/Buenos_Aires'
                                     }).replace(/\//g, '-') : '';
                                     // Limpiar etiquetas HTML básicas de la traducción
                                     const traduccionLimpia = evento.traduccion.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '').replace(/<\/?p>/g, '').replace(/<\/?div>/g, '').replace(/<\/?q>/g, '').replace(/<\/?a.*?>/g, '').replace(/<\/?span>/g, '').trim();
                                     const sucursal = evento.sucursal && evento.sucursal.nombre ? ` (${evento.sucursal.nombre})` : '';

                                     if (fechaHora || traduccionLimpia) {
                                         trackingInfo += `\n- ${fechaHora}: ${traduccionLimpia}${sucursal}`;
                                     }
                                 }
                             } else if (timeline.titulo) {
                                 // Si no hay traducciones detalladas, al menos mostrar el título de la etapa
                                 const fechaUltimoEvento = timeline.fechaUltimoEvento ? new Date(timeline.fechaUltimoEvento).toLocaleString('es-AR', {
                                     year: 'numeric',
                                     month: '2-digit',
                                     day: '2-digit',
                                     hour: '2-digit',
                                     minute: '2-digit',
                                     hour12: false,
                                     timeZone: 'America/Argentina/Buenos_Aires'
                                 }).replace(/\//g, '-') : '';
                                 trackingInfo += `\n- ${fechaUltimoEvento}: ${timeline.titulo}`;
                             }
                         }

                         // Verificar si se añadió algo al historial después de iterar
                         const initialHistoryString = `📦 Estado del tracking **${numeroAndreani || trackingNumber}**:\n${procesoActual.titulo}` + (fechaEstimadaDeEntrega ? ` - ${fechaEstimadaDeEntrega.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '')}` : '') + '\n\nHistorial:';
                         if (trackingInfo === initialHistoryString) {
                              trackingInfo += '\nSin historial de eventos detallado disponible.';
                         }


                     } else {
                         trackingInfo += '\n\nSin historial de eventos disponible.';
                     }

                     console.log(`Información de tracking extraída y formateada.`);

                 } else {
                     // Si la estructura del JSON no es la esperada
                     trackingInfo = `😕 No se pudo encontrar la información de tracking en la respuesta de la API para el número **${trackingNumber}**. La estructura de la respuesta podría haber cambiado.`;
                     console.log(`Estructura de respuesta JSON inesperada para ${trackingNumber}.`);
                 }


             } catch (error) {
                 console.error('Error al consultar la API de tracking de Andreani:', error);
                 // Incluimos el mensaje de error en la respuesta al usuario para depuración
                 trackingInfo = `❌ Hubo un error al consultar el estado del tracking para **${trackingNumber}**. Detalles: ${error.message}`;
             }

             // --- Responder al usuario con la información del tracking ---
             await interaction.editReply({ content: trackingInfo, ephemeral: false }); // ephemeral: false para que todos vean el resultado
             console.log('Respuesta de tracking enviada.');

        } else {
            // Manejar otros comandos de barra si los tienes
            // console.log(`Comando desconocido: ${interaction.commandName}`);
            // Puedes responder con un mensaje si el bot recibe un comando que no espera
            // if (!interaction.replied && !interaction.deferred) { // Evitar responder si ya se respondió o deferrió
            //     await interaction.reply({ content: 'No reconozco ese comando.', ephemeral: true });
            // }
        }
    }

    // --- Manejar Submisiones de Modals ---
    if (interaction.isModalSubmit()) {
        // Verifica si la sumisión es de nuestro modal de solicitud (usando el customId)
        if (interaction.customId === 'solicitudModal') {
             console.log(`Submisión del modal 'solicitudModal' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // Deferir la respuesta inmediatamente. Esto le dice a Discord que estamos procesando
             // y evita que la interacción "expire" si tarda más de 3 segundos.
             // ephemeral: true significa que la respuesta "Pensando..." y la respuesta final solo las verá el usuario que interactuó.
             await interaction.deferReply({ ephemeral: true });


             // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL !!!
             const pedido = interaction.fields.getTextInputValue('pedidoInput');
             const caso = interaction.fields.getTextInputValue('casoInput');
             const email = interaction.fields.getTextInputValue('emailInput');
             // Recuperamos la descripción si está en el modal (aunque no la guardemos en Sheet)
             const descripcion = interaction.fields.getTextInputValue('descripcionInput');

             console.log(`Datos del modal - Pedido: ${pedido}, Caso: ${caso}, Email: ${email}, Descripción: ${descripcion}`);


             // Obtener la fecha y hora actual del sistema del bot
             const fechaHoraActual = new Date();
             // Formatear la fecha y hora. Ajusta 'es-AR' si prefieres otro locale o formato.
             const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                 year: 'numeric',
                 month: '2-digit',
                 day: '2-digit',
                 hour: '2-digit',
                 minute: '2-digit',
                 second: '2-digit',
                 hour12: false, // Formato 24 horas
                 timeZone: 'America/Argentina/Buenos_Aires' // <-- CORRECCIÓN: Especificar la zona horaria
             }).replace(/\//g, '-'); // Reemplazar '/' con '-' para el formato DD-MM-YYYY


             // --- Construir el array de datos para la fila del Sheet ---
             // El orden DEBE coincidir exactamente con tus 4 columnas en Google Sheet:
             // Col 1: "N° de pedido"
             // Col 2: "Fecha/Hora"
             // Col 3: "Caso"
             // Col 4: "Email"
             // NO INCLUIMOS DESCRIPCIÓN SI TU HOJA TIENE SOLO 4 COLUMNAS
             const rowData = [
                 pedido,              // Datos del modal
                 fechaHoraFormateada, // Fecha/Hora del sistema (ahora con zona horaria especificada)
                 `#${caso}`,          // Datos del modal (con # añadido si lo deseas)
                 email,
                 descripcion               // Datos del modal
             ];

             console.log('Datos a escribir en Sheet:', rowData);


             // --- Escribir en Google Sheets y Poner al usuario en estado de espera de archivos ---
             let sheetSuccess = false; // Bandera para saber si se escribió en Sheet

             try {
                 // 1. Escribir los datos de texto en Google Sheets
                 if (spreadsheetId && sheetRange) {
                      console.log('Intentando escribir en Google Sheets...');
                      // ASEGÚRATE QUE sheetRange EN RAILWAY COINCIDE CON TUS 4 COLUMNAS (EJ. Hoja1!A:D)
                      await sheets.spreadsheets.values.append({
                          spreadsheetId: spreadsheetId,
                          range: sheetRange,
                          valueInputOption: 'RAW', // Usar 'RAW' para texto plano
                          insertDataOption: 'INSERT_ROWS', // Agrega una nueva fila
                          resource: { values: [rowData] }, // rowData ahora tiene 4 elementos
                      });
                      console.log('Datos de Sheet agregados correctamente.');
                      sheetSuccess = true; // Marcar como exitoso si no hubo error

                      // 2. Si la escritura en Sheet fue exitosa, poner al usuario en estado de espera de archivos
                      // Solo si hay una carpeta padre de Drive configurada, esperamos archivos.
                      if (parentDriveFolderId) {
                           // Guardamos el ID del usuario y el número de pedido asociado.
                           waitingForAttachments.set(interaction.user.id, {
                                pedido: pedido,
                                timestamp: new Date() // Opcional: Guardar timestamp para posible expiración
                           });
                           console.log(`Usuario ${interaction.user.tag} (ID: ${interaction.user.id}) puesto en estado de espera de adjuntos para pedido ${pedido}.`);
                      } else {
                           console.warn('PARENT_DRIVE_FOLDER_ID no configurado. No se pondrá al usuario en estado de espera de adjuntos.');
                      }


                 } else {
                      console.warn('Variables de Google Sheets no configuradas. Saltando escritura en Sheet y estado de espera.');
                 }


                 // --- Responder al usuario con la confirmación de la solicitud y la instrucción para archivos ---
                 let confirmationMessage = '';
                 if (sheetSuccess) {
                     confirmationMessage += '✅ Solicitud cargada correctamente en Google Sheets.';

                     // Si hay una carpeta padre de Drive configurada, instruir al usuario sobre los archivos.
                     if (parentDriveFolderId) {
                          confirmationMessage += '\nPor favor, envía los archivos adjuntos para esta solicitud en un **mensaje separado** aquí mismo en este canal.';
                     } else {
                          confirmationMessage += '\n⚠️ La carga de archivos adjuntos a Google Drive no está configurada en el bot.';
                     }

                 } else {
                     confirmationMessage += '❌ Solicitud no pudo cargarse en Google Sheets (configuración incompleta).';
                     // Si no se pudo guardar en Sheet, no esperamos archivos.
                     waitingForAttachments.delete(interaction.user.id); // Asegurarse de que no esté en espera
                 }


                 // Usamos editReply para enviar el mensaje final después de deferReply
                 await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                 console.log('Confirmación de solicitud enviada.');


             } catch (error) {
                 console.error('Error general durante el procesamiento de la sumisión del modal (Sheets):', error);

                 // Construir un mensaje de error detallado para el usuario
                 let errorMessage = '❌ Hubo un error al procesar tu solicitud.';
                 // Intentar extraer mensaje de error de Google API si está disponible
                 if (error.response && error.response.data) {
                      // Verificar si hay un mensaje de error específico en la respuesta de Google
                      if (error.response.data.error && error.response.data.error.message) {
                           errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                      } else if (error.response.data.error && Array.isArray(error.response.data.error.errors) && error.response.data.error.errors.length > 0 && error.response.data.error.errors[0].message) {
                           // A veces el mensaje está dentro de un array 'errors'
                            errorMessage += ` Error de Google API: ${error.response.data.error.errors[0].message}`;
                      } else {
                           // Si no encontramos un mensaje estructurado, mostramos el status y statusText
                           errorMessage += ` Error de Google API: ${error.response.status} ${error.response.statusText}`;
                      }
                 } else {
                      // Si no es un error de respuesta de Google API, mostramos el mensaje general del error
                      errorMessage += ` Detalles: ${error.message}`;
                 }
                 errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

                 // Usamos editReply para enviar el mensaje de error
                 await interaction.editReply({ content: errorMessage, ephemeral: true });
                 console.log('Mensaje de error de sumisión de modal enviado.');

                 // Si hubo un error al guardar en Sheet, nos aseguramos de que el usuario no quede en estado de espera
                 waitingForAttachments.delete(interaction.user.id); // Asegurarse de que no esté en espera
             }

        } else {
             // Si la sumisión es de otro modal que no manejamos
             // console.log(`Submisión de modal desconocida con customId: ${interaction.customId}`);
             // if (!interaction.replied && !interaction.deferred) {
             //      await interaction.reply({ content: 'Submisión de modal desconocida.', ephemeral: true });
             // }
        }
    }

    // --- Manejar otros tipos de interacciones (Botones, Select Menus, etc.) ---
    // Si agregas botones o select menus, los manejarías aquí con interaction.isButton() o interaction.isSelectMenu()
});


// --- Funciones de Ayuda ---

/**
 * Función para construir el objeto Modal de Solicitud
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
function buildSolicitudModal() {
    const modal = new ModalBuilder()
        .setCustomId('solicitudModal') // ID único para identificar este modal al ser enviado
        .setTitle('Registrar Nueva Solicitud'); // Título que ve el usuario

    // Campo para N° de Pedido
    const pedidoInput = new TextInputBuilder()
        .setCustomId('pedidoInput') // ID único para este campo dentro del modal
        .setLabel("Número de Pedido")
        .setStyle('Short') // Estilo de campo: una línea
        .setRequired(true); // Hacer que este campo sea obligatorio

    // Campo para Caso
    const casoInput = new TextInputBuilder()
        .setCustomId('casoInput') // ID único para este campo
        .setLabel("Número de Caso")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Email
    const emailInput = new TextInputBuilder()
        .setCustomId('emailInput') // ID único para este campo
        .setLabel("Email del Cliente")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Descripción (Mantenemos en el modal, pero no se guarda en Sheet)
    const descripcionInput = new TextInputBuilder()
        .setCustomId('descripcionInput') // ID único para este campo
        .setLabel("Observaciones de la solicitud")
        .setStyle('Paragraph') // Estilo de campo: multi-línea
        .setRequired(false); // Puede que no siempre sea necesaria

    // Un Modal puede tener hasta 5 ActionRowBuilder. Cada ActionRowBuilder puede contener 1 TextInputBuilder.
    // Creamos una fila por cada campo de texto.
    const firstRow = new ActionRowBuilder().addComponents(pedidoInput);
    const secondRow = new ActionRowBuilder().addComponents(casoInput);
    const thirdRow = new ActionRowBuilder().addComponents(emailInput);
    const fourthRow = new ActionRowBuilder().addComponents(descripcionInput); // Fila para la descripción

    // Añadir las filas de componentes al modal
    // Asegúrate que el número de addComponents coincide con las filas que has definido.
    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow); // Añadir todas las filas


    return modal;
}

/**
 * Busca una carpeta en Google Drive por nombre dentro de una carpeta padre.
 * Si no existe, la crea.
 * @param {object} drive - Instancia de la API de Google Drive.
 * @param {string} parentId - ID de la carpeta padre donde buscar/crear. Si es null/undefined, busca/crea en la raíz del Drive de la cuenta de servicio.
 * @param {string} folderName - Nombre de la carpeta a buscar/crear.
 * @returns {Promise<string>} - Promesa que resuelve con el ID de la carpeta encontrada o creada.
 * @throws {Error} - Lanza un error si falla la búsqueda o creación.
 */
async function findOrCreateDriveFolder(drive, parentId, folderName) {
    try {
        // Construir la query de búsqueda en Drive API
        // Escapar comillas simples en el nombre de la carpeta para evitar problemas en la query
        let query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
            // Si hay una carpeta padre, buscar solo dentro de ella
            query += ` and '${parentId}' in parents`;
        }

        // Listar archivos (carpetas en este caso) que coincidan con la query
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)', // Solicitar solo el ID y nombre de los archivos encontrados
            spaces: 'drive', // Buscar en Google Drive
        });

        if (response.data.files.length > 0) {
            // Carpeta encontrada, retornar su ID
            console.log(`Carpeta de Drive '${folderName}' encontrada.`);
            return response.data.files[0].id;
        } else {
            // Carpeta no encontrada, crearla
            console.log(`Carpeta de Drive '${folderName}' no encontrada. Creando...`);
            const fileMetadata = {
                'name': folderName,
                'mimeType': 'application/vnd.google-apps.folder',
                 // Si parentId existe, especificar que la nueva carpeta sea hija de parentId
                 ...(parentId && { parents: [parentId] })
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                fields: 'id' // Solicitar solo el ID de la carpeta recién creada
            });
            console.log(`Carpeta de Drive '${folderName}' creada con ID: ${file.data.id}`);
            return file.data.id; // Retornar el ID de la carpeta creada
        }
    } catch (error) {
         console.error(`Error al buscar o crear la carpeta '${folderName}' en Drive:`, error);
         throw error; // Relanzar el error para que sea manejado por el try/catch principal
     }
}

/**
 * Descarga un archivo desde una URL (adjunto de Discord) y lo sube a Google Drive.
 * @param {object} drive - Instancia de la API de Google Drive.
 * @param {string} folderId - ID de la carpeta donde subir el archivo.
 * @param {object} attachment - Objeto Attachment de discord.js.
 * @returns {Promise<object>} - Promesa que resuelve con los metadatos (ID y nombre) del archivo subido.
 * @throws {Error} - Lanza un error si falla la descarga o subida.
 */
async function uploadFileToDrive(drive, folderId, attachment) {
     try {
         console.log(`Intentando descargar archivo: ${attachment.name} desde ${attachment.url}`);
         // Usa la variable 'fetch' importada al inicio del archivo
         const fileResponse = await fetch(attachment.url);

         if (!fileResponse.ok) {
             // Si la respuesta HTTP no es 2xx, lanzar un error
             throw new Error(`Error al descargar el archivo ${attachment.name}: HTTP status ${fileResponse.status}, ${fileResponse.statusText}`);
         }

         // Metadatos para el archivo en Drive
         const fileMetadata = {
             name: attachment.name, // Usar el nombre original del archivo adjunto
             parents: [folderId],   // Especificar la carpeta de destino usando su ID
         };

         // Objeto media para la subida del archivo
         const media = {
             mimeType: fileResponse.headers.get('content-type') || 'application/octet-stream', // Obtener MIME type del header HTTP o usar uno genérico
             body: fileResponse.body, // Usar el cuerpo de la respuesta como un stream de datos
         };

         console.log(`Subiendo archivo ${attachment.name} a Drive en la carpeta ${folderId}...`);
         const uploadedFile = await drive.files.create({
             resource: fileMetadata, // Metadatos del archivo
             media: media,           // Datos del archivo (contenido)
             fields: 'id, name',     // Campos a retornar del archivo subido
             // ensureRevisionUpload: true // Opcional: Forzar nueva versión si un archivo con el mismo nombre ya existe
         });

         console.log(`Archivo "${uploadedFile.data.name}" subido con éxito. ID de Drive: ${uploadedFile.data.id}`);
         return uploadedFile.data; // Retornar ID y nombre del archivo subido

     } catch (error) {
         console.error(`Error al descargar o subir el archivo ${attachment.name}:`, error);
         throw error; // Relanzar el error para manejarlo en el try/catch principal de la interacción
     }
}


// --- Conectar el Bot a Discord usando el Token ---
// Inicia sesión con el token del bot. Añadimos mensajes de log y manejador de errores.

console.log("Paso 1: Llegamos a la sección de conexión."); // <-- Log de inicio
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${discordToken ? discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`); // <-- Log para verificar que el token se cargó

client.login(discordToken).catch(err => {
    console.error("Paso 3: Error al conectar con Discord.", err); // <-- Log de error de conexión
    console.error("Paso 3: Detalles completos del error de login:", err); // <-- Log detallado del objeto de error
    process.exit(1); // Salir del proceso si la conexión falla
});

// Este log quizás no aparezca si la conexión falla inmediatamente o si process.exit(1) se ejecuta rápido
console.log("Paso 4: client.login() llamado. Esperando evento 'ready' o error."); // <-- Log después de llamar a login

// NOTA: Asegúrate que tienes un archivo package.json en la raíz de tu proyecto
// con {"type": "module"} y las dependencias discord.js, googleapis, dotenv, node-fetch.
