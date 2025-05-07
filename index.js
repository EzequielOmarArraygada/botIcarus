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
    ApplicationCommandOptionType // Importar ApplicationCommandOptionType para obtener opciones de comandos
} from 'discord.js';

// Importaciones de Google APIs y utilidades
import { google } from 'googleapis'; // Librería oficial de Google
import path from 'path';              // Módulo nativo para manejo de rutas
import fetch from 'node-fetch';       // Para descargar archivos adjuntos desde URL (Importación estándar ESM)

// Importar librería para parsear HTML (necesaria para leer la página de tracking)
// Si no la tienes instalada, necesitarás ejecutar: npm install cheerio
import * as cheerio from 'cheerio';


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
// Opcional: Canal donde restringir el comando /solicitud Y donde se esperan los archivos
const targetChannelId = process.env.TARGET_CHANNEL_ID;


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
client.once('ready', () => {
    console.log(`Bot logeado como ${client.user.tag}!`);
    console.log(`Conectado a Discord.`);
    // Puedes añadir aquí lógica para verificar que los comandos estén registrados globalmente si quieres, pero ya lo haces con el script deploy-commands.js
});

// --- Manejar Mensajes Normales (para recibir archivos adjuntos) ---
// Este listener ahora es crucial para el flujo alternativo de archivos.
client.on('messageCreate', async message => {
    // Ignorar mensajes de bots (incluido el nuestro)
    if (message.author.bot) {
        return;
    }

    // Opcional: Restringir a un canal específico si targetChannelId está configurado
    if (targetChannelId && message.channelId !== targetChannelId) {
        // console.log(`Mensaje recibido fuera del canal objetivo: ${message.content}`);
        return; // Ignorar mensajes fuera del canal objetivo
    }

    console.log(`Mensaje recibido en el canal objetivo de ${message.author.tag} con ${message.attachments.size} adjuntos.`);

    // --- Verificar si el usuario está esperando para enviar adjuntos ---
    const userId = message.author.id;
    const pendingRequest = waitingForAttachments.get(userId);

    // Si el usuario está esperando adjuntos Y el mensaje tiene adjuntos
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
         // O puedes enviar un mensaje efímero:
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

             // Opcional: Restringir el comando a un canal específico
             if (targetChannelId && interaction.channelId !== targetChannelId) {
                  await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${targetChannelId}>.`, ephemeral: true });
                  return; // Salir del handler si no es el canal correcto
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
        } else if (interaction.commandName === 'tracking') { // --- NUEVO MANEJADOR PARA /tracking ---
             console.log(`Comando /tracking recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

             // Deferir la respuesta inmediatamente, ya que la consulta a la página puede tardar.
             await interaction.deferReply({ ephemeral: false }); // Puedes hacerlo efímero si prefieres que solo el usuario vea el resultado

             // Obtener el número de tracking de la opción del comando
             const trackingNumber = interaction.options.getString('numero');
             console.log(`Número de tracking recibido: ${trackingNumber}`);

             if (!trackingNumber) {
                 await interaction.editReply({ content: '❌ Debes proporcionar un número de seguimiento.', ephemeral: true });
                 return;
             }

             // --- Lógica para consultar el tracking en Andreani ---
             let trackingInfo = null; // Variable para guardar la información extraída
             const andreaniBaseUrl = 'https://www.andreani.com'; // URL base del sitio
             const trackingPageUrl = 'https://seguimiento.andreani.com/'; // URL de la página de seguimiento donde encontrar el ID dinámico

             try {
                 console.log(`Paso 1: Obteniendo el ID dinámico de la página de seguimiento...`);
                 // 1. Obtener el HTML de la página de seguimiento para encontrar el ID dinámico
                 const trackingPageResponse = await fetch(trackingPageUrl);
                 if (!trackingPageResponse.ok) {
                     throw new Error(`Error HTTP al obtener la página de seguimiento: ${trackingPageResponse.status} ${trackingPageResponse.statusText}`);
                 }
                 const trackingPageHtml = await trackingPageResponse.text();
                 const $page = cheerio.load(trackingPageHtml);

                 // Intentar encontrar el ID dinámico. Es común en un script tag con id="__NEXT_DATA__"
                 const nextDataScript = $page('script#__NEXT_DATA__');
                 let buildId = null;

                 if (nextDataScript.length > 0) {
                     try {
                         const nextData = JSON.parse(nextDataScript.html());
                         buildId = nextData.buildId;
                         console.log(`ID dinámico encontrado: ${buildId}`);
                     } catch (parseError) {
                         console.error("Error al parsear __NEXT_DATA__:", parseError);
                         // Si no se puede parsear, intentar otro método o lanzar error
                         throw new Error("No se pudo obtener el ID dinámico del sitio de Andreani.");
                     }
                 } else {
                      // Si el script __NEXT_DATA__ no está, podrías intentar buscar en URLs de assets (CSS, JS)
                      // Esto es más complejo y varía, por ahora lanzamos un error si no encontramos el script
                      throw new Error("No se encontró el script __NEXT_DATA__ para obtener el ID dinámico.");
                 }

                 if (!buildId) {
                     throw new Error("No se pudo obtener el ID dinámico del sitio de Andreani (buildId es null).");
                 }


                 console.log(`Paso 2: Construyendo la URL de la API de datos con el ID dinámico.`);
                 // 2. Construir la URL de la API de datos usando el ID dinámico y el número de tracking
                 // La URL de la API de datos tiene la estructura mostrada en la captura:
                 // https://www.andreani.com/_next/data/[buildId]/envio/[trackingNumber].json?trackingNumber=[trackingNumber]
                 const andreaniApiUrl = `${andreaniBaseUrl}/_next/data/${buildId}/envio/${trackingNumber}.json?trackingNumber=${trackingNumber}`;
                 console.log(`URL de la API construida: ${andreaniApiUrl}`);


                 console.log(`Paso 3: Haciendo la solicitud GET a la URL de la API y parseando la respuesta.`);
                 // 3. Hacer la solicitud GET a la URL de la API de datos
                 const apiResponse = await fetch(andreaniApiUrl);

                 // La API puede devolver 404 si el tracking no existe o 200 con HTML si existe
                 if (apiResponse.status === 404) {
                     trackingInfo = `📦 No se encontró información para el número de seguimiento **${trackingNumber}**. Verifica que el número sea correcto.`;
                     console.log(`Consulta API devolvió 404 para ${trackingNumber}.`);

                 } else if (!apiResponse.ok) {
                     // Otros errores HTTP
                     throw new Error(`Error HTTP al consultar la API de Andreani: ${apiResponse.status} ${apiResponse.statusText}`);

                 } else {
                     // La respuesta es 200 OK, ahora leemos el cuerpo (que es HTML según la captura)
                     console.log(`Consulta API devolvió 200 OK. Leyendo y parseando HTML...`);
                     const apiHtml = await apiResponse.text();
                     const $api = cheerio.load(apiHtml);

                     // --- PARSEAR EL HTML DE LA RESPUESTA PARA EXTRAER LA INFORMACIÓN ---
                     // ESTA ES LA PARTE QUE DEBES ADAPTAR.
                     // Necesitas inspeccionar el HTML que devuelve la URL de la API (la que termina en .json)
                     // cuando buscas un tracking válido para encontrar los selectores CSS
                     // (clases, IDs, estructura) que contienen el estado, los eventos, etc.

                     // --- Selectores CSS tentativos basados en el HTML proporcionado ---
                     // Busca un elemento que contenga el estado principal. Podría ser un h2 o p dentro de una sección.
                     const estadoEnvioElement = $api('h2'); // <<< Selector tentativo: Busca todos los h2 y toma el primero
                     const estadoEnvio = estadoEnvioElement.first().text().trim(); // Tomamos el texto del primer h2 encontrado

                     let eventosEnvio = '';
                     // Busca la lista de eventos. Podría ser un ul o ol.
                     const eventosList = $api('ul'); // <<< Selector tentativo: Busca todos los ul y toma el primero
                     if (eventosList.length > 0) {
                         eventosEnvio = '\n\nHistorial:';
                         // Busca los elementos de lista (li) dentro de la lista encontrada
                         $api('li', eventosList.first()).each((index, element) => { // Busca li dentro del primer ul
                             // Dentro de cada li, busca elementos que contengan la fecha/hora y descripción.
                             // Esto es muy tentativo y DEBE SER VERIFICADO en el Inspector de Elementos.
                             const fechaHora = $api(element).find('span:first-child').text().trim(); // <<< Selector tentativo: primer span dentro del li
                             const descripcion = $api(element).find('span:last-child').text().trim(); // <<< Selector tentativo: último span dentro del li
                             if (fechaHora || descripcion) { // Solo agrega si hay contenido
                                 eventosEnvio += `\n- ${fechaHora}: ${descripcion}`;
                             }
                         });
                     } else {
                         eventosEnvio = '\n\nSin historial de eventos disponible.';
                     }

                     // --- FIN Selectores CSS tentativos ---


                     if (estadoEnvio) {
                         trackingInfo = `📦 Estado del tracking **${trackingNumber}**:\n${estadoEnvio}${eventosEnvio}`;
                         console.log(`Información de tracking extraída: ${trackingInfo}`);
                     } else {
                         // Si no se pudo extraer el estado, quizás la estructura HTML cambió o el tracking no es válido a pesar del 200
                         trackingInfo = `😕 No se pudo encontrar la información de estado en la página de resultados para el número **${trackingNumber}**. La estructura de la página podría haber cambiado o el tracking no es válido.`;
                         console.log(`No se pudo extraer información para ${trackingNumber} (estadoEnvio vacío).`);
                     }
                 }


             } catch (error) {
                 console.error('Error al consultar el tracking en Andreani:', error);
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
                 email               // Datos del modal
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
                 waitingForAttachments.delete(interaction.user.id);
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
