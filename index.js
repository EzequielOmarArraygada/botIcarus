import 'dotenv/config';

// --- Importaciones ---
// Importaciones de discord.js
import {
    Client,
    GatewayIntentBits,
    ModalBuilder,       // Para construir el modal
    TextInputBuilder,   // Para construir campos de texto en el modal
    ActionRowBuilder,    // Para organizar componentes en el modal
    ApplicationCommandOptionType, // Importar ApplicationCommandOptionOptionType
    StringSelectMenuBuilder, // Para construir Select Menus de texto
    StringSelectMenuOptionBuilder, // Para construir opciones del Select Menu
    ButtonBuilder, // Para construir botones
    ButtonStyle // Para definir estilos de botones
} from 'discord.js';

// Importaciones de Google APIs y utilidades
import { google } from 'googleapis'; // Librería oficial de Google
import path from 'path';              // Módulo nativo para manejo de rutas
import fetch from 'node-fetch';       // Para descargar archivos adjuntos desde URL (Importación estándar ESM)

// --- Configuración del Cliente de Discord ---
// Aquí se crea la instancia principal del bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,         // Necesario para reconocer servidores y comandos, y para obtener displayName
        GatewayIntentBits.GuildMessages,  // Necesario para el listener messageCreate
        GatewayIntentBits.MessageContent, // CRUCIAL para leer el contenido de mensajes, incluyendo adjuntos
        GatewayIntentBits.GuildMembers,   // <-- NUEVO: Necesario para buscar miembros por nombre y obtener sus IDs
    ]
});

// --- Variables de Entorno de Discord ---
// Se leen de process.env después de importar 'dotenv/config'
const discordToken = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID; // Necesitamos el ID del servidor

// Canales específicos donde se permiten los comandos (usados para la restricción manual)
const targetChannelIdFacA = process.env.TARGET_CHANNEL_ID_FAC_A; // Canal para /factura-a
const targetChannelIdEnvios = process.env.TARGET_CHANNEL_ID_ENVIOS; // Canal para /tracking
const targetChannelIdCasos = process.env.TARGET_CHANNEL_ID_CASOS; // Canal para /agregar-caso Y NOTIFICACIONES DE ERROR
// NUEVA VARIABLE: Canal donde se permite el comando /buscar-caso
const targetChannelIdBuscarCaso = process.env.TARGET_CHANNEL_ID_BUSCAR_CASO;


const helpChannelId = process.env.HELP_CHANNEL_ID; // ID del canal de ayuda/explicaciones (si se mantiene)


// --- Variables de Entorno para IDs de Comandos ---
// Configura estas variables de entorno en Railway.
const commandIdFacturaA = process.env.COMMAND_ID_FACTURA_A; // ID numérico del comando /factura-a
const commandIdTracking = process.env.COMMAND_ID_TRACKING;   // ID numérico del comando /tracking
const commandIdAgregarCaso = process.env.COMMAND_ID_AGREGAR_CASO; // VARIABLE ACTUALIZADA: ID numérico del comando /agregar-caso
// NUEVA VARIABLE: ID numérico del comando /buscar-caso
const commandIdBuscarCaso = process.env.COMMAND_ID_BUSCAR_CASO;


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
    // Asegúrate de incluir scopes para Sheets Y Drive if usas ambas APIs
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
// Variables para la hoja de Factura A (asumiendo que las originales eran para esto)
const spreadsheetIdFacA = process.env.GOOGLE_SHEET_ID_FAC_A;
const sheetRangeFacA = process.env.GOOGLE_SHEET_RANGE_FAC_A;

// Variables para la hoja de Casos/Devoluciones
const spreadsheetIdCasos = process.env.GOOGLE_SHEET_ID_CASOS;
const sheetRangeCasos = process.env.GOOGLE_SHEET_RANGE_CASOS; // Rango para agregar nuevos casos (A:F)
// Rango para leer datos, incluyendo la columna de error (hasta J) y Notificado (K)
// ¡Recuerda actualizar GOOGLE_SHEET_RANGE_CASOS_READ en Railway para que incluya la columna K!
const sheetRangeCasosRead = process.env.GOOGLE_SHEET_RANGE_CASOS_READ; // Por ejemplo: 'SOLICITUDES BGH 2025!A:K'

// NUEVAS VARIABLES para el comando /buscar-caso
// ID del Google Sheet donde buscar casos (puede ser el mismo que spreadsheetIdCasos)
const spreadsheetIdBuscarCaso = process.env.GOOGLE_SHEET_SEARCH_SHEET_ID || spreadsheetIdCasos; // Usar el de casos como fallback
// Lista de nombres de pestañas (sheets) donde buscar, separadas por coma (ej: 'Pestaña1,Pestaña2,Historial')
const sheetsToSearch = process.env.GOOGLE_SHEET_SEARCH_SHEETS ? process.env.GOOGLE_SHEET_SEARCH_SHEETS.split(',').map(s => s.trim()) : [];


// Validaciones básicas para variables de Google
if (!spreadsheetIdFacA || !sheetRangeFacA) {
    console.warn("Advertencia: Variables de entorno para Google Sheets (Factura A) incompletas. La funcionalidad de Factura A podría no funcionar.");
}
if (!spreadsheetIdCasos || !sheetRangeCasos) {
     console.warn("Advertencia: Variables de entorno para Google Sheets (Casos) incompletas. La funcionalidad de registro de casos podría no funcionar.");
}
// NUEVA VALIDACIÓN para la variable de rango de lectura de errores
if (!sheetRangeCasosRead) {
    console.warn("Advertencia: Variable de entorno GOOGLE_SHEET_RANGE_CASOS_READ no configurada. La funcionalidad de notificación de errores de casos no funcionará.");
}
// NUEVA VALIDACIÓN para las variables de búsqueda de casos
if (!spreadsheetIdBuscarCaso || sheetsToSearch.length === 0) {
    console.warn("Advertencia: Variables de entorno para la búsqueda de casos incompletas (GOOGLE_SHEET_SEARCH_SHEET_ID o GOOGLE_SHEET_SEARCH_SHEETS). El comando /buscar-caso no funcionará.");
}


// Configuración de Google Drive Específica (usada para Factura A adjuntos)
const parentDriveFolderId = process.env.PARENT_DRIVE_FOLDER_ID; // ID de la carpeta padre en Drive
if (!parentDriveFolderId) {
     console.warn("Advertencia: PARENT_DRIVE_FOLDER_ID no configurado en .env. Los archivos adjuntos de Factura A se subirán a la raíz de Drive de la cuenta de servicio si se adjuntan.");
}



const userPendingData = new Map();

// Intervalo de tiempo entre verificaciones de errores en la hoja (en milisegundos)
let ERROR_CHECK_INTERVAL = process.env.ERROR_CHECK_INTERVAL_MS ? parseInt(process.env.ERROR_CHECK_INTERVAL_MS) : 300000; // Default: 5 minutos (300000 ms)
if (isNaN(ERROR_CHECK_INTERVAL) || ERROR_CHECK_INTERVAL < 10000) { // Mínimo 10 segundos
    console.warn(`ERROR_CHECK_INTERVAL_MS configurado incorrectamente o muy bajo (${process.env.ERROR_CHECK_INTERVAL_MS}). Usando valor por defecto: ${ERROR_CHECK_INTERVAL} ms.`);
    ERROR_CHECK_INTERVAL = 300000; // Reset a 5 minutos if es inválido
}

// --- Opciones para el Select Menu de Tipo de Solicitud ---
const tipoSolicitudOptions = [
    { label: 'CAMBIO DEFECTUOSO', value: 'CAMBIO DEFECTUOSO' },
    { label: 'CAMBIO INCORRECTO', value: 'CAMBIO INCORRECTO' },
    { label: 'RETIRO ARREPENTIMIENTO', value: 'RETIRO ARREPENTIMIENTO' },
    { label: 'PRODUCTO INCOMPLETO', value: 'PRODUCTO INCOMPLETO' },
    { label: 'OTROS', value: 'OTROS' },
];


// --- Eventos del Bot de Discord ---

// Cuando el bot se conecta exitosamente y está listo
client.once('ready', async () => {
    console.log(`Bot logeado como ${client.user.tag}!`);
    console.log(`Conectado a Discord.`);

    // La lógica de establecimiento automático de permisos de comandos por canal fue omitida.
    console.log('Lógica de establecimiento automático de permisos de comandos por canal omitida.');

    // --- Iniciar la verificación periódica de errores en la hoja ---
    if (spreadsheetIdCasos && sheetRangeCasosRead && targetChannelIdCasos) {
        console.log(`Iniciando verificación periódica de errores cada ${ERROR_CHECK_INTERVAL / 1000} segundos.`);
        // Llamar a la función de verificación inmediatamente y luego configurar el intervalo
        checkSheetForErrors();
        // Usar setInterval para repetir la verificación
        setInterval(checkSheetForErrors, ERROR_CHECK_INTERVAL);
    } else {
        console.warn("La verificación periódica de errores no se iniciará debido a la falta de configuración de Google Sheets (ID, rango de lectura) o canal de casos.");
    }

    // Puedes añadir aquí lógica para verificar que los comandos estén registrados globalmente si quieres, pero ya lo haces con el script deploy-commands.js
});

// --- Manejar Mensajes Normales (para recibir archivos adjuntos de Factura A y explicaciones de comandos) ---
client.on('messageCreate', async message => {
    // Ignorar mensajes de bots (incluido el nuestro)
    if (message.author.bot) {
        return;
    }

    // Convertir el mensaje a minúsculas para hacer la detección menos sensible a mayúsculas/minúsculas
    const messageContentLower = message.content.toLowerCase();

    // --- Lógica para responder a preguntas sobre comandos en el canal de ayuda ---
    if (helpChannelId && message.channelId === helpChannelId) {
        // Si el mensaje contiene la palabra "factura-a" o "solicitud" (por si preguntan por el nombre viejo)
        if (messageContentLower.includes('factura-a') || messageContentLower.includes('solicitud')) {
            const helpMessage = `
Para usar el comando **/factura-a**:

Este comando abre un formulario (Modal) para registrar una nueva solicitud de Factura A.

1.  Escribe \`/factura-a\` en el canal [menciona el canal si aplica, ej: <#${targetChannelIdFacA || 'ID_CANAL_FACTURA_A'}>].
2.  Completa los datos solicitados en el formulario que aparecerá (Número de Pedido, Número de Caso, Email del Cliente, Detalle de la Solicitud).
3.  Haz clic en "Enviar".
4.  Si necesitas adjuntar archivos para esta solicitud, envíalos en un **mensaje SEPARADO** aquí mismo en este canal [o menciona el canal de Factura A si es diferente].
`;
            await message.reply({ content: helpMessage, ephemeral: false }); // ephemeral: false para que todos en el canal de ayuda lo vean
            return; // Salir del listener después de responder
        }

        // Si el mensaje contiene la palabra "tracking" Y NO contuvo "factura-a" o "solicitud" (para evitar doble respuesta)
        if (messageContentLower.includes('tracking') && !messageContentLower.includes('factura-a') && !messageContentLower.includes('solicitud')) {
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

        // Si el mensaje contiene la palabra "caso" o "devolucion" o "cambio" o "agregar" o "buscar"
        if (messageContentLower.includes('caso') || messageContentLower.includes('devolucion') || messageContentLower.includes('cambio') || messageContentLower.includes('agregar') || messageContentLower.includes('buscar')) {
            // --- EXPLICACIÓN ACTUALIZADA PARA /agregar-caso Y /buscar-caso ---
            let helpMessage = `
Para usar el comando **/agregar-caso**:

Este comando inicia el proceso para registrar un nuevo caso de cambio o devolución.

1.  Escribe \`/agregar-caso\` **únicamente** en el canal <#${targetChannelIdCasos || 'ID_CANAL_CASOS'}>.
2.  El bot te enviará un mensaje con un desplegable para que elijas el **Tipo de Solicitud**.
3.  Después de elegir el tipo, haz clic en el botón "Completar Detalles" que aparecerá.
4.  El bot te presentará un formulario (Modal) para completar los demás datos (Número de Pedido, Número de Caso, Dirección/Teléfono/Datos).
5.  Completa el formulario y haz clic en "Enviar".
`;
            // Añadir explicación para /buscar-caso si el canal de ayuda es relevante o si no hay canal específico para buscar
            if (targetChannelIdBuscarCaso && message.channelId === targetChannelIdBuscarCaso || !targetChannelIdBuscarCaso) {
                 helpMessage += `\n\nPara usar el comando **/buscar-caso**:

Este comando te permite buscar casos por Número de Pedido en las hojas de Google Sheets configuradas.

1.  Escribe \`/buscar-caso pedido:\` seguido del número de pedido que quieres buscar.
2.  Ejemplo: \`/buscar-caso pedido: 12345\`
3.  El bot buscará en las pestañas configuradas y te mostrará las filas encontradas.
`;
            } else if (targetChannelIdBuscarCaso) {
                 // Si hay un canal específico para buscar, mencionar ese canal
                 helpMessage += `\n\nPara usar el comando **/buscar-caso**: Por favor, usa este comando en el canal <#${targetChannelIdBuscarCaso}>.`;
            }


            await message.reply({ content: helpMessage, ephemeral: false }); // ephemeral: false para que todos en el canal de ayuda lo vean
            return; // Salir del listener después de responder
        }
    }


    // --- Lógica existente para recibir archivos adjuntos (solo para Factura A) ---
    // Esta lógica solo se ejecutará si el mensaje no fue una pregunta sobre un comando en el canal de ayuda.

    // Restringir la recepción de adjuntos al canal de Factura A (si está configurado y es diferente al canal de ayuda)
    if (targetChannelIdFacA && message.channelId !== targetChannelIdFacA && message.channelId !== helpChannelId) {
         // console.log(`Mensaje recibido fuera de los canales objetivo para adjuntos: ${message.content}`);
         return; // Ignorar mensajes fuera del canal objetivo para adjuntos
    }

    // Si el mensaje está en el canal de Factura A (o en el canal de ayuda si es el mismo)
    // Y si el usuario está esperando adjuntos (de una solicitud de Factura A) Y el mensaje tiene adjuntos
    const userId = message.author.id;
    const pendingData = userPendingData.get(userId); // Usar el mapa renombrado

    // Verificar si el usuario está esperando adjuntos Y si el dato pendiente es de tipo 'facturaA'
    if (pendingData && pendingData.type === 'facturaA' && message.attachments.size > 0) {
        console.log(`Usuario ${message.author.tag} está esperando adjuntos para el pedido ${pendingData.pedido} (Factura A). Procesando...`);

        // Eliminar al usuario del estado de espera inmediatamente
        userPendingData.delete(userId); // Usar mapa renombrado

        // --- Procesar y subir archivos a Google Drive ---
        let driveFolderLink = null; // Para guardar el enlace a la carpeta de Drive

        try {
            // Asegúrate de tener el ID de la carpeta padre de Drive configurado en .env
            if (!parentDriveFolderId) {
                 console.warn("PARENT_DRIVE_FOLDER_ID no configurado. No se subirán archivos adjuntos.");
                 await message.reply({ content: '⚠️ No se pudo subir los archivos adjuntos: La carpeta de destino en Google Drive no está configurada en el bot.', ephemeral: true });
                 return; // Salir si no hay carpeta padre configurada
            }

            console.log(`Iniciando subida de ${message.attachments.size} archivos a Google Drive para el pedido ${pendingData.pedido}...`);

            // Nombre de la carpeta en Drive (usar el número de pedido de la solicitud pendiente de Factura A)
            const driveFolderName = `FacturaA_Pedido_${pendingData.pedido}`.replace(/[\/\\]/g, '_'); // Nombre de carpeta específico para Factura A

            // Encontrar o crear la carpeta de destino en Drive
            const folderId = await findOrCreateDriveFolder(drive, parentDriveFolderId, driveFolderName);
            console.log(`Carpeta de Drive (ID: ${folderId}) encontrada o creada para el pedido ${pendingData.pedido}.`);

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
            let confirmationMessage = `✅ Se ${message.attachments.size === 1 ? 'subió' : 'subieron'} ${message.attachments.size} ${message.attachments.size === 1 ? 'archivo' : 'archivos'} a Google Drive para el Pedido ${pendingData.pedido} (Factura A).`;
            if (driveFolderLink) {
                 confirmationMessage += `\nCarpeta: ${driveFolderLink}`; // Enlace en nueva línea
            }

            // Responder como un mensaje efímero para no saturar el chat
            await message.reply({ content: confirmationMessage, ephemeral: true });
            console.log('Confirmación de subida de archivos enviada.');


        } catch (error) {
            // --- MANEJO DE ERRORES MEJORADO ---
            console.error('Error durante la subida de archivos a Drive (Factura A):', error);

            // Construir un mensaje de error detallado para el usuario
            let errorMessage = `❌ Hubo un error al subir los archivos adjuntos para el Pedido ${pendingData.pedido} (Factura A).`;

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
         console.log(`Mensaje con adjuntos recibido de ${message.author.tag}, pero no está en estado de espera. Ignorando adjuntos.`);
    } else {
    }
});


// --- Manejar Interacciones (Comandos de Barra, Sumisiones de Modals, Select Menus, Buttons, etc.) ---
client.on('interactionCreate', async interaction => {
    if (interaction.user.bot) return; // Ignorar interacciones de bots

    // --- Manejar Comandos de Barra (Slash Commands) ---
    if (interaction.isChatInputCommand()) {
        // Verifica si es el comando "/factura-a"
        if (interaction.commandName === 'factura-a') {
             console.log(`Comando /factura-a recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // --- Restricción de canal para /factura-a ---
             if (targetChannelIdFacA && interaction.channelId !== targetChannelIdFacA) {
                  await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdFacA}>.`, ephemeral: true });
                  return; // Salir del handler si no es el canal correcto
             }

            // !!! MOSTRAR EL MODAL DE Factura A !!!
            try {
                const modal = buildFacturaAModal(); // Función que crea el objeto Modal (definida más abajo)
                // showModal() debe ser la respuesta INICIAL a la interacción del comando
                await interaction.showModal(modal);
                console.log('Modal de Factura A mostrado al usuario.');

            } catch (error) {
                console.error('Error al mostrar el modal de Factura A:', error);
                await interaction.reply({ content: 'Hubo un error al abrir el formulario de solicitud de Factura A. Por favor, inténtalo de nuevo.', ephemeral: true });
                userPendingData.delete(interaction.user.id); // Usar mapa renombrado
            }
        } else if (interaction.commandName === 'tracking') { // --- MANEJADOR PARA /tracking ---
             console.log(`Comando /tracking recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // --- Restricción de canal para /tracking ---
             if (targetChannelIdEnvios && interaction.channelId !== targetChannelIdEnvios) {
                 await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdEnvios}>.`, ephemeral: true });
                 return; // Salir del handler si no es el canal correcto
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

        } else if (interaction.commandName === 'agregar-caso') { // MANEJADOR ACTUALIZADO PARA /agregar-caso
            console.log(`Comando /agregar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

            // --- Restricción de canal para /agregar-caso ---
            // Verifica si targetChannelIdCasos está configurado Y si el canal de la interacción NO es el canal objetivo
            if (targetChannelIdCasos && interaction.channelId !== targetChannelIdCasos) {
                 await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdCasos}>.`, ephemeral: true });
                 return; // Salir del handler si no es el canal correcto
            }

            // --- Iniciar el flujo de 2 pasos: Mostrar Select Menu para Tipo de Solicitud ---
            try {
                const selectMenu = buildTipoSolicitudSelectMenu(); // Función para el Select Menu
                const actionRow = new ActionRowBuilder().addComponents(selectMenu);

                // Guardar el estado pendiente del usuario, indicando que está en el paso 1 del flujo de casos
                userPendingData.set(interaction.user.id, { type: 'caso', paso: 1 }); // Usar mapa renombrado

                // Responder con el mensaje que contiene el Select Menu. Ephemeral para no saturar el canal.
                await interaction.reply({
                    content: 'Por favor, selecciona el tipo de solicitud:',
                    components: [actionRow],
                    ephemeral: true,
                });
                console.log('Select Menu de Tipo de Solicitud mostrado al usuario.');

            } catch (error) {
                console.error('Error al mostrar el Select Menu de Tipo de Solicitud:', error);
                await interaction.reply({ content: 'Hubo un error al iniciar el formulario de registro de caso. Por favor, inténtalo de nuevo.', ephemeral: true });
                userPendingData.delete(interaction.user.id); // Limpiar estado pendiente si falla
            }

        } else if (interaction.commandName === 'buscar-caso') { // --- NUEVO MANEJADOR PARA /buscar-caso ---
             console.log(`Comando /buscar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // --- Restricción de canal para /buscar-caso ---
             if (targetChannelIdBuscarCaso && interaction.channelId !== targetChannelIdBuscarCaso) {
                 await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelIdBuscarCaso}>.`, ephemeral: true });
                 return; // Salir del handler si no es el canal correcto
             }

             // Deferir la respuesta inmediatamente, ya que la búsqueda en múltiples sheets puede tardar.
             await interaction.deferReply({ ephemeral: false }); // Puedes hacerlo efímero si prefieres que solo el usuario vea el resultado

             // Obtener el número de pedido de la opción del comando
             const numeroPedidoBuscar = interaction.options.getString('pedido');
             console.log(`Número de pedido a buscar: ${numeroPedidoBuscar}`);

             // --- Validar que el valor buscado no sea la frase literal "Número de pedido" ---
             if (numeroPedidoBuscar.trim().toLowerCase() === 'número de pedido') {
                  await interaction.editReply({ content: '❌ Por favor, ingresa un **número de pedido real** para buscar, no el nombre de la columna.', ephemeral: true });
                  return;
             }


             if (!numeroPedidoBuscar) {
                 await interaction.editReply({ content: '❌ Debes proporcionar un número de pedido para buscar.', ephemeral: true });
                 return;
             }

             // --- Lógica para buscar en Google Sheets ---
             if (!spreadsheetIdBuscarCaso || sheetsToSearch.length === 0) {
                 console.error("Error: Variables de entorno para la búsqueda de casos incompletas.");
                 await interaction.editReply({ content: '❌ Error de configuración del bot: La búsqueda de casos no está configurada correctamente.', ephemeral: true });
                 return;
             }

             let foundRows = []; // Array para almacenar las filas encontradas
             let searchSummary = `Resultados de la búsqueda para el pedido **${numeroPedidoBuscar}**:\n\n`;
             let totalFound = 0;

             try {
                 // Iterar sobre cada nombre de sheet especificado
                 for (const sheetName of sheetsToSearch) {
                     console.log(`Buscando en la pestaña: "${sheetName}"`);
                     // Leer todos los datos de la pestaña actual
                     // Usamos un rango abierto (ej: 'Pestaña1!A:Z') para leer todas las columnas posibles
                     const range = `${sheetName}!A:Z`;
                     let response;
                     try {
                         response = await sheets.spreadsheets.values.get({
                             spreadsheetId: spreadsheetIdBuscarCaso,
                             range: range,
                         });
                     } catch (sheetError) {
                          console.warn(`Error al leer la pestaña "${sheetName}":`, sheetError.message);
                          searchSummary += `⚠️ Error al leer la pestaña "${sheetName}". Podría no existir o no tener permisos.\n`;
                          continue; // Saltar a la siguiente pestaña si hay un error al leer esta
                     }


                     const rows = response.data.values;

                     if (!rows || rows.length <= 1) { // Asumimos que la primera fila son encabezados
                         console.log(`Pestaña "${sheetName}" vacía o solo con encabezados.`);
                         continue; // Saltar a la siguiente pestaña si no hay datos
                     }

                     const headerRow = rows[0]; // La primera fila son los encabezados
                     console.log(`Encabezados leídos de la pestaña "${sheetName}":`, headerRow); // <-- LOGGING ADICIONAL

                     // Buscar el índice de la columna "Número de pedido" (insensible a mayúsculas/minúsculas y espacios)
                     const pedidoColumnIndex = headerRow.findIndex(header =>
                          header && String(header).trim().toLowerCase() === 'número de pedido' // <-- Aseguramos la comparación con 'número de pedido'
                     );

                     if (pedidoColumnIndex === -1) {
                         console.warn(`No se encontró la columna "Número de pedido" en la pestaña "${sheetName}".`);
                         searchSummary += `⚠️ No se encontró la columna "Número de pedido" en la pestaña "${sheetName}".\n`;
                         continue; // Saltar a la siguiente pestaña si no se encuentra la columna
                     } else {
                         console.log(`Columna "Número de pedido" encontrada en el índice ${pedidoColumnIndex} en la pestaña "${sheetName}".`);
                     }


                     // Iterar sobre las filas de datos (saltando el encabezado)
                     let foundInSheet = 0;
                     for (let i = 1; i < rows.length; i++) {
                         const row = rows[i];
                         const rowNumber = i + 1; // Número de fila en Google Sheets (basado en 1)

                         // Asegurarse de que la fila tiene la columna del número de pedido antes de acceder a ella
                         if (row.length <= pedidoColumnIndex) {
                              // console.warn(`La fila ${rowNumber} en la pestaña "${sheetName}" no tiene suficientes columnas.`);
                              continue; // Saltar esta fila si no tiene suficientes columnas
                         }

                         // Obtener el valor en la columna "Número de pedido" para esta fila
                         const rowPedidoValue = row[pedidoColumnIndex] ? String(row[pedidoColumnIndex]).trim() : '';

                         // Comparar con el número de pedido buscado (insensible a mayúsculas/minúsculas y espacios)
                         if (rowPedidoValue.toLowerCase() === numeroPedidoBuscar.toLowerCase()) {
                             // ¡Coincidencia encontrada! Añadir la fila completa y la información de la pestaña/fila.
                             foundRows.push({
                                 sheet: sheetName,
                                 rowNumber: rowNumber,
                                 data: row // Guardar todos los datos de la fila
                             });
                             foundInSheet++;
                             totalFound++;
                         }
                     }
                     console.log(`Encontrados ${foundInSheet} resultados en la pestaña "${sheetName}".`);
                 }

                 // --- Formatear y enviar la respuesta ---
                 if (foundRows.length > 0) {
                     searchSummary += `✅ Se encontraron **${foundRows.length}** coincidencias:\n\n`;

                     // Construir el mensaje detallado con cada fila encontrada
                     let detailedResults = '';
                     for (const found of foundRows) {
                         detailedResults += `**Pestaña:** "${found.sheet}", **Fila:** ${found.rowNumber}\n`;
                         const displayColumns = found.data.slice(0, Math.min(found.data.length, 6)).join(' | '); // Unir las primeras 6 columnas con '|' o menos si la fila es más corta
                         detailedResults += `\`${displayColumns}\`\n\n`; // Usar bloques de código para formato
                     }

                     const fullMessage = searchSummary + detailedResults;

                     if (fullMessage.length > 2000) {
                          await interaction.editReply({ content: searchSummary + "Los resultados completos son demasiado largos para mostrar aquí. Por favor, revisa la hoja de Google Sheets directamente.", ephemeral: false });
                     } else {
                          await interaction.editReply({ content: fullMessage, ephemeral: false });
                     }


                 } else {
                     // Si no se encontraron coincidencias en ninguna pestaña
                     searchSummary += '😕 No se encontraron coincidencias en las pestañas configuradas.';
                     await interaction.editReply({ content: searchSummary, ephemeral: false });
                 }


             } catch (error) {
                 console.error('Error general durante la búsqueda de casos en Google Sheets:', error);
                 // Construir un mensaje de error detallado para el usuario
                 let errorMessage = '❌ Hubo un error al realizar la búsqueda de casos.';
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

                 await interaction.editReply({ content: errorMessage, ephemeral: false }); // Mostrar error aunque sea efímero
             }


        } else {
        }
    }

    // --- Manejar Interacciones de Select Menu ---
    if (interaction.isStringSelectMenu()) { // NUEVO MANEJADOR para Select Menus
        // Verifica si la interacción es de nuestro Select Menu de Tipo de Solicitud
        if (interaction.customId === 'casoTipoSolicitudSelect') { // CUSTOM ID del Select Menu
            console.log(`Selección en Select Menu 'casoTipoSolicitudSelect' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

            const userId = interaction.user.id;
            const pendingData = userPendingData.get(userId); // Usar mapa renombrado

            // Verificar si el usuario estaba en el paso 1 del flujo de casos
            if (pendingData && pendingData.type === 'caso' && pendingData.paso === 1) {
                const selectedTipoSolicitud = interaction.values[0]; // Obtiene el valor seleccionado (es un array, tomamos el primero)
                console.log(`Tipo de Solicitud seleccionado: ${selectedTipoSolicitud}`);

                // Actualizar el estado pendiente del usuario con el tipo de solicitud seleccionado
                userPendingData.set(userId, { type: 'caso', paso: 2, tipoSolicitud: selectedTipoSolicitud, interactionId: interaction.id }); // <-- Guardar interactionId para followUp/editReply


                // --- Responder al Select Menu: Editar el mensaje original y añadir un botón ---
                try {
                    // Crear el botón para completar los detalles
                    const completeDetailsButton = new ButtonBuilder()
                        .setCustomId('completeCasoDetailsButton') // ID único para este botón
                        .setLabel('Completar Detalles del Caso')
                        .setStyle(ButtonStyle.Primary); // Estilo del botón

                    const buttonActionRow = new ActionRowBuilder().addComponents(completeDetailsButton);

                    // Editar el mensaje original que contenía el Select Menu
                    await interaction.update({ // Usar update() para editar el mensaje original
                        content: `Tipo de Solicitud seleccionado: **${selectedTipoSolicitud}**. Haz clic en el botón para completar los detalles.`,
                        components: [buttonActionRow], // Reemplazar el Select Menu con el botón
                        ephemeral: true, // Mantener como efímero
                    });
                    console.log('Mensaje del Select Menu editado y botón "Completar Detalles" mostrado.');

                } catch (error) {
                    console.error('Error al responder al Select Menu o mostrar el botón:', error);
                    // Usar followUp para enviar un mensaje de error si update() falla
                    await interaction.followUp({ content: 'Hubo un error al procesar tu selección. Por favor, intenta usar el comando /agregar-caso de nuevo.', ephemeral: true });
                    userPendingData.delete(userId); // Limpiar estado pendiente si falla
                }

            } else {
                // Si el usuario interactuó con el Select Menu pero no estaba en el estado esperado
                 console.warn(`Interacción de Select Menu inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                 // Usar followUp para enviar un mensaje de error si la interacción es inesperada
                 await interaction.followUp({ content: 'Esta selección no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
                 userPendingData.delete(userId); // Limpiar estado por si acaso
            }
        }
        // Manejar otros Select Menus si los tienes
    }

    // --- Manejar Interacciones de Botón ---
    if (interaction.isButton()) { // NUEVO MANEJADOR para Botones
        // Verifica si la interacción es de nuestro botón para completar detalles del caso
        if (interaction.customId === 'completeCasoDetailsButton') { // CUSTOM ID del botón
            console.log(`Clic en botón 'completeCasoDetailsButton' recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

            const userId = interaction.user.id;
            const pendingData = userPendingData.get(userId); // Usar mapa renombrado

            // Verificar si el usuario estaba en el paso 2 del flujo de casos (esperando el modal)
            if (pendingData && pendingData.type === 'caso' && pendingData.paso === 2 && pendingData.tipoSolicitud) {

                // !!! MOSTRAR EL MODAL DE REGISTRO DE CASO (Paso 3) !!!
                try {
                    const modal = buildCasoModal(); // Función que crea el objeto Modal para casos

                    // showModal() debe ser la respuesta a la interacción del BOTÓN
                    await interaction.showModal(modal);
                    console.log('Modal de registro de caso (Paso 3) mostrado al usuario.');

                    // Opcional: Editar el mensaje del botón para indicar que el modal se mostró
                    await interaction.editReply({
                        content: `Tipo de Solicitud seleccionado: **${pendingData.tipoSolicitud}**. Por favor, completa el formulario que apareció.`,
                        components: [], // Eliminar el botón del mensaje
                        ephemeral: true,
                    });


                } catch (error) {
                    console.error('Error al mostrar el Modal de registro de caso (Paso 3):', error);
                    // Usar followUp para enviar un mensaje de error si showModal falla
                    await interaction.followUp({ content: 'Hubo un error al abrir el formulario de detalles del caso. Por favor, inténtalo de nuevo.', ephemeral: true });
                    userPendingData.delete(userId); // Limpiar estado pendiente si falla
                }

            } else {
                // Si el usuario hizo clic en el botón pero no estaba en el estado esperado
                 console.warn(`Clic en botón inesperado de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                 // Usar followUp para enviar un mensaje de error si la interacción es inesperada
                 await interaction.followUp({ content: 'Este botón no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
                 userPendingData.delete(userId); // Limpiar estado por si acaso
            }
        }
        // Manejar otros botones si los tienes
    }


    // --- Manejar Sumisiones de Modals ---
    if (interaction.isModalSubmit()) {
        // Verifica si la sumisión es de nuestro modal de Factura A (usando el customId)
        if (interaction.customId === 'facturaAModal') {
             console.log(`Submisión del modal 'facturaAModal' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // Deferir la respuesta inmediatamente.
             await interaction.deferReply({ ephemeral: true });


             // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL DE FACTURA A !!!
             const pedido = interaction.fields.getTextInputValue('pedidoInput');
             const caso = interaction.fields.getTextInputValue('casoInput');
             const email = interaction.fields.getTextInputValue('emailInput');
             const descripcion = interaction.fields.getTextInputValue('descripcionInput'); // Mantuvimos este campo en el modal

             console.log(`Datos del modal Factura A - Pedido: ${pedido}, Caso: ${caso}, Email: ${email}, Descripción: ${descripcion}`);


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


             const rowData = [
                 pedido,              // Datos del modal
                 fechaHoraFormateada, // Fecha/Hora del sistema (ahora con zona horaria especificada)
                 `#${caso}`,          // Datos del modal (con # añadido si lo deseas)
                 email,               // Datos del modal
                 descripcion          // Datos del modal (si tu sheet tiene esta columna)
             ];

             console.log('Datos a escribir en Sheet (Factura A):', rowData);


             // --- Escribir en Google Sheets (Factura A) y Poner al usuario en estado de espera de archivos ---
             let sheetSuccess = false; // Bandera para saber si se escribió en Sheet

             try {
                 // 1. Escribir los datos de texto en Google Sheets (Factura A)
                 if (spreadsheetIdFacA && sheetRangeFacA) { // Usar variables de Factura A
                      console.log('Intentando escribir en Google Sheets (Factura A)...');
                      // ASEGÚRATE QUE sheetRangeFacA EN RAILWAY COINCIDE CON TUS COLUMNAS
                      await sheets.spreadsheets.values.append({
                          spreadsheetId: spreadsheetIdFacA, // Usar ID de Factura A
                          range: sheetRangeFacA,         // Usar rango de Factura A
                          valueInputOption: 'RAW', // Usar 'RAW' para texto plano
                          insertDataOption: 'INSERT_ROWS', // Agrega una nueva fila
                          resource: { values: [rowData] }, // rowData ahora tiene 5 elementos si agregaste descripción
                      });
                      console.log('Datos de Sheet (Factura A) agregados correctamente.');
                      sheetSuccess = true; // Marcar como exitoso si no hubo error

                      // 2. Si la escritura en Sheet fue exitosa, poner al usuario en estado de espera de archivos (solo si hay carpeta Drive)
                      if (parentDriveFolderId) {
                           // Guardamos el ID del usuario y el número de pedido asociado.
                           userPendingData.set(interaction.user.id, { // Usar mapa renombrado
                                type: 'facturaA', // Indicar que espera adjuntos de Factura A
                                pedido: pedido, // Guardamos el pedido para nombrar la carpeta de Drive
                                timestamp: new Date() // Opcional: Guardar timestamp para posible expiración
                           });
                           console.log(`Usuario ${interaction.user.tag} (ID: ${interaction.user.id}) puesto en estado de espera de adjuntos para pedido ${pedido} (Factura A).`);
                      } else {
                           console.warn('PARENT_DRIVE_FOLDER_ID no configurado. No se pondrá al usuario en estado de espera de adjuntos para Factura A.');
                      }


                 } else {
                      console.warn('Variables de Google Sheets (Factura A) no configuradas. Saltando escritura en Sheet y estado de espera para Factura A.');
                 }


                 // --- Responder al usuario con la confirmación de la solicitud de Factura A y la instrucción para archivos ---
                 let confirmationMessage = '';
                 if (sheetSuccess) {
                     confirmationMessage += '✅ Solicitud de Factura A cargada correctamente en Google Sheets.';

                     // Si hay una carpeta padre de Drive configurada, instruir al usuario sobre los archivos.
                     if (parentDriveFolderId) {
                          confirmationMessage += '\nPor favor, envía los archivos adjuntos para esta solicitud en un **mensaje separado** aquí mismo en este canal.';
                     } else {
                          confirmationMessage += '\n⚠️ La carga de archivos adjuntos a Google Drive no está configurada en el bot para Factura A.';
                     }

                 } else {
                     confirmationMessage += '❌ Solicitud de Factura A no pudo cargarse en Google Sheets (configuración incompleta).';
                     // Si no se pudo guardar en Sheet, no esperamos archivos.
                     userPendingData.delete(interaction.user.id); // Usar mapa renombrado
                 }


                 // Usamos editReply para enviar el mensaje final después de deferReply
                 await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                 console.log('Confirmación de solicitud de Factura A enviada.');


             } catch (error) {
                 console.error('Error general durante el procesamiento de la sumisión del modal (Factura A Sheets):', error);

                 // Construir un mensaje de error detallado para el usuario
                 let errorMessage = '❌ Hubo un error al procesar tu solicitud de Factura A.';
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
                 console.log('Mensaje de error de sumisión de modal Factura A enviado.');

                 // Si hubo un error al guardar en Sheet, nos aseguramos de que el usuario no quede en estado de espera
                 userPendingData.delete(interaction.user.id); // Usar mapa renombrado
             }

        } else if (interaction.customId === 'casoModal') { // Manejador para la sumisión del modal de casos
             console.log(`Submisión del modal 'casoModal' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // Deferir la respuesta inmediatamente.
             await interaction.deferReply({ ephemeral: true });

             const userId = interaction.user.id;
             const pendingData = userPendingData.get(userId); // Usar mapa renombrado

             // Verificar si el usuario estaba en el paso 2 del flujo de casos y tenemos el tipo de solicitud guardado
             if (pendingData && pendingData.type === 'caso' && pendingData.paso === 2 && pendingData.tipoSolicitud) {

                 // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL DE CASOS !!!
                 const pedido = interaction.fields.getTextInputValue('casoPedidoInput'); // Usar IDs de campos específicos del modal de casos
                 const numeroCaso = interaction.fields.getTextInputValue('casoNumeroCasoInput');
                 // El tipo de solicitud ya lo tenemos guardado en pendingData.tipoSolicitud
                 const datosContacto = interaction.fields.getTextInputValue('casoDatosContactoInput');

                 const tipoSolicitud = pendingData.tipoSolicitud; // <-- OBTENEMOS DEL ESTADO PENDIENTE

                 console.log(`Datos del modal Caso - Pedido: ${pedido}, Número Caso: ${numeroCaso}, Tipo Solicitud (guardado): ${tipoSolicitud}, Datos Contacto: ${datosContacto}`);

                 // Obtener la fecha y hora actual del sistema del bot
                 const fechaHoraActual = new Date();
                 const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                     year: 'numeric',
                     month: '2-digit',
                     day: '2-digit',
                     hour: '2-digit',
                     minute: '2-digit',
                     second: '2-digit',
                     hour12: false, // Formato 24 horas
                     timeZone: 'America/Argentina/Buenos_Aires'
                 }).replace(/\//g, '-'); // Reemplazar '/' con '-' para el formato DD-MM-YYYY


                 const agenteDiscord = interaction.member ? interaction.member.displayName : interaction.user.username; // <-- USAR displayName o username como fallback

                 const rowDataCaso = [
                     pedido,              // Col A
                     fechaHoraFormateada, // Col B
                     agenteDiscord,       // Col C <-- USANDO displayName
                     numeroCaso,          // Col D
                     tipoSolicitud,       // Col E <-- USANDO VALOR DEL SELECT MENU
                     datosContacto        // Col F
                 ];

                 console.log('Datos a escribir en Sheet (Casos):', rowDataCaso);

                 // --- Escribir en Google Sheets (Casos) ---
                 let sheetSuccess = false;
                 try {
                     if (spreadsheetIdCasos && sheetRangeCasos) { // Usar variables de Casos
                         console.log('Intentando escribir en Google Sheets (Casos)...');
                         // ASEGÚRATE QUE sheetRangeCasos EN RAILWAY COINCIDE CON TUS COLUMNAS (ej: SOLICITUDES BGH 2025!A:F)
                         await sheets.spreadsheets.values.append({
                             spreadsheetId: spreadsheetIdCasos, // Usar ID de Casos
                             range: sheetRangeCasos,         // Usar rango de Casos
                             valueInputOption: 'RAW', // Usar 'RAW' para texto plano
                             insertDataOption: 'INSERT_ROWS', // Agrega una nueva fila
                             resource: { values: [rowDataCaso] },
                         });
                         console.log('Datos de Sheet (Casos) agregados correctamente.');
                         sheetSuccess = true;
                     } else {
                         console.warn('Variables de Google Sheets (Casos) no configuradas. Saltando escritura en Sheet para casos.');
                     }

                     // --- Responder al usuario con la confirmación del registro de caso ---
                     let confirmationMessage = '';
                     if (sheetSuccess) {
                         confirmationMessage += '✅ Caso registrado correctamente en Google Sheets.';
                     } else {
                         confirmationMessage += '❌ El caso no pudo registrarse en Google Sheets (configuración incompleta).';
                     }

                     await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                     console.log('Confirmación de registro de caso enviada.');

                 } catch (error) {
                     console.error('Error general durante el procesamiento de la sumisión del modal (Casos Sheets):', error);

                     // Construir un mensaje de error detallado para el usuario
                     let errorMessage = '❌ Hubo un error al procesar el registro de tu caso.';
                     // Intentar extraer mensaje de error de Google API si está disponible
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

                     await interaction.editReply({ content: errorMessage, ephemeral: true });
                     console.log('Mensaje de error de sumisión de modal Caso enviado.');
                 } finally {
                     // Limpiar el estado pendiente del usuario después de procesar la sumisión del modal
                     userPendingData.delete(userId); // Usar mapa renombrado
                     console.log(`Estado pendiente del usuario ${interaction.user.tag} limpiado.`);
                 }


             } else {
                 // Si el usuario envió el modal pero no estaba en el estado esperado (paso 2)
                 console.warn(`Sumisión de modal 'casoModal' inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                 await interaction.editReply({ content: 'Esta sumisión de formulario no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
                 userPendingData.delete(userId); // Limpiar estado por si acaso
             }

        } else {
        }
    }

});

// --- FUNCIÓN PARA VERIFICAR ERRORES EN LA HOJA DE GOOGLE SHEETS ---
async function checkSheetForErrors() {
    console.log('Iniciando verificación de errores en Google Sheets...');

    // Asegurarse de que las variables necesarias estén configuradas
    // Necesitamos spreadsheetIdCasos, sheetRangeCasosRead (que incluye K), targetChannelIdCasos, y guildId
    if (!spreadsheetIdCasos || !sheetRangeCasosRead || !targetChannelIdCasos || !guildId) {
        console.warn('Configuración incompleta para la verificación de errores. Saltando la verificación.');
        return;
    }

    try {
        // Leer los datos de la hoja de Google Sheets, incluyendo la columna J (ERROR) y K (NOTIFICADO)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetIdCasos,
            // ¡Usar el rango que incluye la columna de error (J) Y la de notificación (K)!
            range: sheetRangeCasosRead,
        });

        const rows = response.data.values;

        // Si no hay datos en la hoja (aparte de los encabezados), no hay nada que verificar
        if (!rows || rows.length <= 1) { // Asumimos que la primera fila son encabezados
            console.log('No hay datos de casos en la hoja para verificar.');
            return;
        }

        // Obtener el canal de Discord donde se enviarán las notificaciones
        const casesChannel = await client.channels.fetch(targetChannelIdCasos);
        if (!casesChannel) {
            console.error(`Error: No se pudo encontrar el canal de Discord con ID ${targetChannelIdCasos}.`);
            return;
        }

        // Obtener el servidor (Guild) para buscar miembros por nombre
        const guild = await client.guilds.fetch(guildId);
         if (!guild) {
             console.error(`Error: No se pudo encontrar el servidor de Discord con ID ${guildId}.`);
             return;
         }
         // Cargar todos los miembros del servidor para poder buscarlos por nombre
         // Asegurarse de tener el intent GuildMembers activado
         await guild.members.fetch();
         console.log(`Miembros del servidor ${guild.name} cargados para búsqueda.`);

        // Extraer el nombre de la hoja del rango configurado (Ej: 'SOLICITUDES BGH 2025!A:K')
        const sheetName = sheetRangeCasosRead.split('!')[0];
        if (!sheetName) {
            console.error(`Error: No se pudo obtener el nombre de la hoja del rango de lectura configurado: ${sheetRangeCasosRead}.`);
            return;
        }


        // Iterar sobre las filas (empezando desde la segunda fila para omitir encabezados)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 1; // Número de fila en Google Sheets (basado en 1)

            // Índices de las columnas: J es 9, K es 10
            const errorColumnIndex = 9; // Columna J
            const notifiedColumnIndex = 10; // Columna K

            // Asegurarse de que la fila tiene suficientes columnas para acceder a la columna J y K
            const errorValue = row.length > errorColumnIndex ? (String(row[errorColumnIndex] || '')).trim() : ''; // Valor en columna J
            const notifiedValue = row.length > notifiedColumnIndex ? (String(row[notifiedColumnIndex] || '')).trim() : ''; // Valor en columna K

            // Si hay contenido en la columna J (ERROR) Y la columna K está vacía (NO Notificado)
            if (errorValue && !notifiedValue) {
                console.log(`Error sin notificar encontrado en la fila ${rowNumber}: "${errorValue}"`);

                // Extraer datos relevantes de la fila (ajusta los índices según tus columnas A-F)
                const pedido = row[0] || 'N/A'; // Col A: N° de pedido (índice 0)
                const fecha = row[1] || 'N/A'; // Col B: Fecha (índice 1)
                const agenteName = row[2] || 'N/A'; // Col C: Agente que cargo la solicitud (índice 2)
                const numeroCaso = row[3] || 'N/A'; // Col D: Numero de caso (índice 3)
                const tipoSolicitud = row[4] || 'N/A'; // Col E: Solicitud (índice 4)
                const datosContacto = row[5] || 'N/A'; // Col F: Dirección/Telefono/Datos (índice 5)
                // Col J: ERROR (índice 9) - ya lo tenemos en errorValue
                // Col K: NOTIFICADO (índice 10) - ya lo tenemos en notifiedValue (sabemos que está vacío)

                // --- Intentar encontrar el usuario de Discord por nombre ---
                let mention = agenteName; // Por defecto, usar el nombre de la hoja si no encontramos al usuario
                try {
                    // Buscar en los miembros del servidor por displayName o username
                    const foundMember = guild.members.cache.find(member =>
                        member.displayName === agenteName || member.user.username === agenteName
                    );

                    if (foundMember) {
                        mention = `<@${foundMember.user.id}>`; // Usar la mención si se encuentra el miembro
                        console.log(`Usuario de Discord encontrado para "${agenteName}": ${foundMember.user.tag}`);
                    } else {
                        console.warn(`No se encontró un usuario de Discord con displayName o username "${agenteName}" en el servidor.`);
                         mention = `**${agenteName}** (Usuario no encontrado)`; // Indicar que no se encontró
                    }
                } catch (findError) {
                    console.error(`Error al buscar usuario de Discord por nombre "${agenteName}":`, findError);
                    mention = `**${agenteName}** (Error al buscar usuario)`; // Indicar error en la búsqueda
                }


                // --- Construir el mensaje de notificación ---
                const notificationMessage = `
🚨 **Error detectado en la hoja de Casos** 🚨

${mention}, hay un error marcado en un caso que cargaste:

**Fila en Sheet:** ${rowNumber}
**N° de Pedido:** ${pedido}
**N° de Caso:** ${numeroCaso}
**Tipo de Solicitud:** ${tipoSolicitud}
**Datos de Contacto:** ${datosContacto}
**Error:** ${errorValue}

Por favor, revisa la hoja para más detalles.
`;

                // --- Enviar el mensaje al canal de casos ---
                try {
                    await casesChannel.send(notificationMessage);
                    console.log(`Notificación de error enviada para la fila ${rowNumber}.`);

                    // --- Marcar la fila como notificada en Google Sheets (Columna K) ---
                    // Obtener la fecha y hora actual para la marca
                     const now = new Date();
                     const notificationTimestamp = now.toLocaleString('es-AR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                     }).replace(/\//g, '-');

                    const updateRange = `${sheetName}!K${rowNumber}`; // Rango específico para la celda K de la fila actual
                    const updateValue = [[`Notificado ${notificationTimestamp}`]]; // Valor a escribir (en un array de arrays)

                    console.log(`Marcando fila ${rowNumber} como notificada en rango ${updateRange} con valor: ${updateValue}`);

                    await sheets.spreadsheets.values.update({
                        spreadsheetId: spreadsheetIdCasos,
                        range: updateRange,
                        valueInputOption: 'RAW', // Escribir el valor tal cual
                        resource: { values: updateValue },
                    });
                    console.log(`Fila ${rowNumber} marcada como notificada en Google Sheets.`);


                } catch (sendOrUpdateError) {
                    console.error(`Error al enviar el mensaje de notificación o marcar la fila ${rowNumber}:`, sendOrUpdateError);
                    // Si falla el envío o la actualización, no hacemos nada para que se intente de nuevo en la próxima verificación
                }
            }
        }

        console.log('Verificación de errores en Google Sheets completada.');

    } catch (error) {
        console.error('Error al leer la hoja de Google Sheets para verificar errores:', error);
        // Opcional: Notificar a un canal de administración o loggear el error de forma más persistente
    }
}


/**
 * Función para construir el objeto Modal de Factura A
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
function buildFacturaAModal() {
    const modal = new ModalBuilder()
        .setCustomId('facturaAModal') // CUSTOM ID RENOMBRADO
        .setTitle('Registrar Solicitud Factura A'); // Título que ve el usuario

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
        .setLabel("Detalle de la Solicitud")
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
 * Función para construir el Select Menu del Tipo de Solicitud de Caso.
 * @returns {StringSelectMenuBuilder} - El objeto Select Menu listo para ser usado en un mensaje.
 */
function buildTipoSolicitudSelectMenu() { // Función para el Select Menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('casoTipoSolicitudSelect') // ID único para identificar este Select Menu
        .setPlaceholder('Selecciona el tipo de solicitud...'); // Texto que se muestra antes de seleccionar

    // Añadir las opciones al Select Menu
    tipoSolicitudOptions.forEach(option => {
        selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label) // Texto que ve el usuario
                .setValue(option.value) // Valor que se envía al bot
        );
    });

    return selectMenu;
}

/**
 * Función para construir el objeto Modal de Registro de Caso (Cambios/Devoluciones)
 * Este modal ahora NO incluye el campo de Tipo de Solicitud.
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
function buildCasoModal() { // Función para el modal de casos (MODIFICADA)
    const modal = new ModalBuilder()
        .setCustomId('casoModal') // ID único para identificar este modal al ser enviado
        .setTitle('Detalles del Caso'); // Título que ve el usuario (cambiado para reflejar que es el paso 2)

    // Campo para N° de Pedido (para el caso)
    const casoPedidoInput = new TextInputBuilder()
        .setCustomId('casoPedidoInput') // ID único para este campo
        .setLabel("Número de Pedido")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Número de Caso (para el caso)
    const casoNumeroCasoInput = new TextInputBuilder()
        .setCustomId('casoNumeroCasoInput') // ID único para este campo
        .setLabel("Número de Caso")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Dirección/Telefono/Datos
    const casoDatosContactoInput = new TextInputBuilder()
        .setCustomId('casoDatosContactoInput') // ID único para este campo
        .setLabel("Dirección / Teléfono / Otros Datos")
        .setStyle('Paragraph') // Usar estilo párrafo para más espacio
        .setRequired(true); // Hacer que este campo sea obligatorio

    // Creamos una fila por cada campo de texto.
    const row1 = new ActionRowBuilder().addComponents(casoPedidoInput);
    const row2 = new ActionRowBuilder().addComponents(casoNumeroCasoInput);
    // La fila del Tipo de Solicitud se elimina de aquí
    const row3 = new ActionRowBuilder().addComponents(casoDatosContactoInput);


    // Añadir las filas de componentes al modal
    modal.addComponents(row1, row2, row3);

    return modal;
}


/**
 * Busca una carpeta en Google Drive por nombre dentro de una carpeta padre.
 * Si no existe, la crea.
 * @param {object} drive - Instancia de la API de Google Drive (obtenida de google.drive()).
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
         return uploadedFile.data; 

     } catch (error) {
         console.error(`Error al descargar o subir el archivo ${attachment.name}:`, error);
         throw error; 
     }
}


console.log("Paso 1: Llegamos a la sección de conexión."); // <-- Log de inicio
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${discordToken ? discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`); // <-- Log para verificar que el token se cargó

client.login(discordToken).catch(err => {
    console.error("Paso 3: Error al conectar con Discord.", err); // <-- Log de error de conexión
    console.error("Paso 3: Detalles completos del error de login:", err); // <-- Log detallado del objeto de error
    process.exit(1); // Salir del proceso si la conexión falla
});

console.log("Paso 4: client.login() llamado. Esperando evento 'ready' o error."); // <-- Log después de llamar a login

