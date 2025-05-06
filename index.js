// Cargar variables de entorno del archivo .env (forma para Módulos ES)
import 'dotenv/config';

// --- Importaciones ---
// Importaciones de discord.js
import {
    Client,
    GatewayIntentBits,
    ModalBuilder,       // Para construir el modal
    TextInputBuilder,   // Para construir campos de texto en el modal
    ActionRowBuilder    // Para organizar componentes en el modal
} from 'discord.js';

// Importaciones de Google APIs y utilidades
import { google } from 'googleapis'; // Librería oficial de Google
import path from 'path';              // Módulo nativo para manejo de rutas
import fetch from 'node-fetch';       // Para descargar archivos adjuntos desde URL (Importación estándar ESM)


// --- Configuración del Cliente de Discord (ESTE BLOQUE FALTABA O ESTABA MAL UBICADO) ---
// Aquí se crea la instancia principal del bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,         // Necesario para reconocer servidores y comandos
        GatewayIntentBits.GuildMessages,  // Necesario para el listener messageCreate si lo usas
        GatewayIntentBits.MessageContent, // CRUCIAL para leer el contenido de mensajes si NO usas solo slash commands (y para el flujo original de parsing de texto)
        // Los permisos para interacciones (Slash Commands, Modals) se dan al invitar el bot con el scope applications.commands
    ]
});

// --- Variables de Entorno de Discord ---
// Se leen de process.env después de importar 'dotenv/config'
const discordToken = process.env.DISCORD_TOKEN;
// Opcional: Canal donde restringir el comando /solicitud
const targetChannelId = process.env.TARGET_CHANNEL_ID;


// --- Configuración de Google Sheets Y Google Drive ---

// DECLARACIÓN DE LA VARIABLE credentials
let credentials;

// --- Lógica para cargar credenciales SOLAMENTE desde GOOGLE_CREDENTIALS_JSON ---
// Este bloque asume que SIEMPRE usarás la variable GOOGLE_CREDENTIALS_JSON en el entorno (Railway)
// Elimina la lógica de GOOGLE_CREDENTIALS_PATH para evitar errores de 'require' en ESM
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

// Puedes quitar el console.log de credentials antes de GoogleAuth si quieres, ya que la carga crítica está manejada arriba
// console.log('Valor de la variable credentials antes de GoogleAuth:', credentials); // <-- Esta línea dio error ReferenceError antes porque 'credentials' no existía

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


// --- Manejo Temporal de Archivos Adjuntos ---
// Usamos un Map para guardar los archivos adjuntos mientras esperamos el Modal.
// La clave será el ID del USUARIO. Limitación: Un usuario solo puede tener 1 solicitud pendiente a la vez.
const pendingAttachments = new Map();


// --- Eventos del Bot de Discord ---

// Cuando el bot se conecta exitosamente y está listo
client.once('ready', () => {
    console.log(`Bot logeado como ${client.user.tag}!`);
    console.log(`Conectado a Discord.`);
    // Puedes añadir aquí lógica para verificar que los comandos estén registrados globalmente si quieres, pero ya lo haces con el script deploy-commands.js
});

// Opcional: Listener de mensajes normales si lo necesitas para algo más
// Este listener ya no se usa para procesar solicitudes con regex en este flujo.
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    // console.log(`Mensaje normal recibido en #${message.channel.name}: ${message.content}`);
    // Puedes agregar lógica para comandos de mensaje o procesamiento de texto aquí si lo deseas.
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


             // ** GUARDAR ARCHIVOS ADJUNTOS SI EXISTEN, USANDO user.id COMO CLAVE **
             // Los archivos adjuntos vienen con la interacción inicial del comando
             const attachments = interaction.attachments;
             if (attachments && attachments.size > 0) {
                 console.log(`Archivos adjuntos detectados: ${attachments.size}. Guardando en caché con clave user.id: ${interaction.user.id}`);
                 // Guardamos el Collection de attachments usando el ID del usuario como clave.
                 pendingAttachments.set(interaction.user.id, attachments);
                 // Puedes añadir un temporizador aquí para limpiar el caché si el usuario no envía el modal a tiempo
                 // setTimeout(() => pendingAttachments.delete(interaction.user.id), 1000 * 60 * 10); // ej: limpiar después de 10 minutos
             } else {
                 console.log('No hay archivos adjuntos en este comando.');
                 // Si no hay adjuntos, asegúrate de limpiar cualquier archivo viejo que pudiera estar en el caché para este usuario
                 pendingAttachments.delete(interaction.user.id);
             }


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
                // Limpiar attachments pendientes si falló el modal
                pendingAttachments.delete(interaction.user.id);
            }
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
             // y evita que la interacción "expire" si tarda más de 3 segundos (como subir a Drive).
             // ephemeral: true significa que la respuesta "Pensando..." y la respuesta final solo las verá el usuario que interactuó.
             await interaction.deferReply({ ephemeral: true });


             // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL !!!
             const pedido = interaction.fields.getTextInputValue('pedidoInput');
             const caso = interaction.fields.getTextInputValue('casoInput');
             const email = interaction.fields.getTextInputValue('emailInput');
             // Recuperamos también la descripción si está en el modal
             const observaciones = interaction.fields.getTextInputValue('observacionesInput');

             console.log(`Datos del modal - Pedido: ${pedido}, Caso: ${caso}, Email: ${email}, Descripción: ${observaciones}`);


             // !!! RECUPERAR ARCHIVOS ADJUNTOS PENDIENTES USANDO user.id COMO CLAVE !!!
             // Usamos la misma clave user.id que usamos al guardar en el handler del comando
             const attachments = pendingAttachments.get(interaction.user.id);
             console.log(`Archivos adjuntos recuperados del caché para user ID ${interaction.user.id}: ${attachments ? attachments.size : 0}`);

             // Limpiar el caché inmediatamente después de intentar recuperarlos para este usuario
             pendingAttachments.delete(interaction.user.id);


             // Obtener la fecha y hora actual del sistema del bot
             const fechaHoraActual = new Date();
             // Formatear la fecha y hora. Ajusta 'es-AR' si prefieres otro locale o formato.
             const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                 year: 'numeric', month: '2-digit', day: '2-digit',
                 hour: '2-digit', minute: '2-digit', second: '2-digit',
                 hour12: false // Formato 24 horas
             }).replace(/\//g, '-'); // Reemplazar '/' con '-' para el formato DD-MM-YYYY


             // --- Construir el array de datos para la fila del Sheet ---
             // El orden DEBE coincidir exactamente con las columnas en tu Google Sheet:
             // Col 1: "N° de pedido"
             // Col 2: "Fecha/Hora"
             // Col 3: "Caso"
             // Col 4: "Email"
             // Col 5: "Descripción" (Si agregaste esta columna a tu Sheet)
             const rowData = [
                 pedido,              // Datos del modal
                 fechaHoraFormateada, // Fecha/Hora del sistema
                 `#${caso}`,          // Datos del modal (con # añadido si lo deseas)
                 email,               // Datos del modal
                 observaciones          // Datos del modal
                 // Si tu hoja solo tiene 4 columnas, omite la descripción aquí
             ];

             console.log('Datos a escribir en Sheet:', rowData);


             // --- Procesar Archivos (Si existen) y Escribir en Google Sheets ---
             let driveFolderLink = null; // Para guardar el enlace a la carpeta de Drive
             let sheetSuccess = false; // Bandera para saber si se escribió en Sheet

             try {
                 // 1. Escribir los datos de texto en Google Sheets
                 if (spreadsheetId && sheetRange) {
                      console.log('Intentando escribir en Google Sheets...');
                      // Asegúrate que sheetRange abarca todas las columnas necesarias (ej. Hoja1!A:D o Hoja1!A:E)
                      await sheets.spreadsheets.values.append({
                          spreadsheetId: spreadsheetId,
                          range: sheetRange,
                          valueInputOption: 'USER_ENTERED', // Deja que Google interprete los datos
                          insertDataOption: 'INSERT_ROWS', // Agrega una nueva fila
                          resource: { values: [rowData] }, // El array de datos como una fila
                      });
                      console.log('Datos de Sheet agregados correctamente.');
                      sheetSuccess = true; // Marcar como exitoso si no hubo error
                 } else {
                      console.warn('Variables de Google Sheets no configuradas. Saltando escritura en Sheet.');
                 }


                 // 2. Procesar y subir archivos a Google Drive si hay adjuntos Y si configuraste PARENT_DRIVE_FOLDER_ID
                 if (attachments && attachments.size > 0 && parentDriveFolderId) {
                     console.log(`Iniciando subida de ${attachments.size} archivos a Google Drive...`);

                     // Nombre de la carpeta en Drive (usar el número de pedido, limpiando caracteres problemáticos)
                     const driveFolderName = `Pedido_${pedido}`.replace(/[\/\\]/g, '_');

                     // Encontrar o crear la carpeta de destino en Drive
                     const folderId = await findOrCreateDriveFolder(drive, parentDriveFolderId, driveFolderName);
                     console.log(`Carpeta de Drive (ID: ${folderId}) encontrada o creada.`);

                     // Subir cada archivo adjunto a la carpeta encontrada/creada
                     // Convertimos el Collection de Discord.js a un Array para usar map y Promise.all
                     const uploadPromises = Array.from(attachments.values()).map(attachment =>
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

                 } else {
                    console.log('No hay archivos adjuntos o PARENT_DRIVE_FOLDER_ID no configurado. Saltando subida a Drive.');
                 }


                 // --- Responder al usuario con el resultado ---
                 let confirmationMessage = '';
                 if (sheetSuccess) {
                     confirmationMessage += '✅ Solicitud cargada correctamente en Google Sheets.';
                 } else {
                     confirmationMessage += '⚠️ Solicitud no pudo cargarse en Google Sheets (configuración incompleta).';
                 }

                 if (attachments && attachments.size > 0) {
                      if (parentDriveFolderId) {
                          confirmationMessage += ` Se ${attachments.size === 1 ? 'subió' : 'subieron'} ${attachments.size} ${attachments.size === 1 ? 'archivo' : 'archivos'} a Google Drive.`;
                          if (driveFolderLink) {
                               confirmationMessage += `\nCarpeta: ${driveFolderLink}`; // Enlace en nueva línea
                          }
                      } else {
                           confirmationMessage += `\n⚠️ No se configuró PARENT_DRIVE_FOLDER_ID. No se subieron ${attachments.size} archivos.`;
                      }
                 } else {
                      confirmationMessage += ' No se adjuntaron archivos.';
                 }


                 // Usamos editReply porque habíamos llamado a deferReply al inicio del modalSubmit
                 await interaction.editReply({ content: confirmationMessage, ephemeral: true });


             } catch (error) {
                 console.error('Error general durante el procesamiento de la solicitud (Sheet o Drive):', error);

                 // Construir un mensaje de error detallado para el usuario
                 let errorMessage = '❌ Hubo un error al procesar tu solicitud.';
                 // Intentar extraer mensaje de error de Google API si está disponible
                 if (error.response && error.response.data && error.response.data.error) {
                      errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                 } else {
                      errorMessage += ` Detalles: ${error.message}`; // Mensaje de error general
                 }
                 errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

                 // Usamos editReply para enviar el mensaje de error
                 await interaction.editReply({ content: errorMessage, ephemeral: true });

                 // Aquí podrías añadir lógica para loguear el error en un servicio externo o notificarte.
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

    // Campo para Descripción (Agregado según requerimiento y ejemplo)
    const observacionesInput = new TextInputBuilder()
        .setCustomId('observacionesInput') // ID único para este campo
        .setLabel("Observaciones de la Solicitud")
        .setStyle('Paragraph') // Estilo de campo: multi-línea
        .setRequired(false); // Puedes cambiar a true si la descripción es obligatoria

    // Un Modal puede tener hasta 5 ActionRowBuilder. Cada ActionRowBuilder puede contener 1 TextInputBuilder.
    // Creamos una fila por cada campo de texto.
    const firstRow = new ActionRowBuilder().addComponents(pedidoInput);
    const secondRow = new ActionRowBuilder().addComponents(casoInput);
    const thirdRow = new ActionRowBuilder().addComponents(emailInput);
    const fourthRow = new ActionRowBuilder().addComponents(observacionesInput); // Fila para la descripción

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


// --- Conectar el Bot a Discord usando el Token (ESTE BLOQUE FALTABA) ---
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