import { Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, ActionRowBuilder } from 'discord.js';
import { google } from 'googleapis';
import path from 'path';
import fetch from 'node-fetch'

let credentials;

// Lógica segura para cargar credenciales desde variable de entorno o archivo
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        console.log("Credenciales de Google cargadas desde variable de entorno.");
    } catch (error) {
        console.error("Error al parsear GOOGLE_CREDENTIALS_JSON. Asegúrate de que es JSON válido:", error.message);
        // IMPORTANTE: Salir del proceso si las credenciales no se pueden cargar
        process.exit(1);
    }
} else if (process.env.GOOGLE_CREDENTIALS_PATH) {
     try {
        // path.resolve(process.cwd(), ...) asegura que la ruta relativa funciona correctamente
        credentials = require(path.resolve(process.cwd(), process.env.GOOGLE_CREDENTIALS_PATH));
         console.log(`Credenciales de Google cargadas desde archivo: ${process.env.GOOGLE_CREDENTIALS_PATH}`);
    } catch (error) {
        console.error(`Error al cargar archivo de credenciales desde ${process.env.GOOGLE_CREDENTIALS_PATH}:`, error.message);
        console.error("Asegúrate de que la ruta en .env y el archivo JSON son correctos.");
         // IMPORTANTE: Salir del proceso si las credenciales no se pueden cargar
        process.exit(1);
    }
} else {
    console.error("Error: No se encontraron credenciales de Google. Configura GOOGLE_CREDENTIALS_JSON o GOOGLE_CREDENTIALS_PATH en .env.");
     // IMPORTANTE: Salir del proceso si faltan las variables
    process.exit(1);
}

// Asegurarse de que se cargaron las credenciales antes de continuar
// Esta verificación adicional es buena práctica, aunque los exit(1) anteriores deberían ser suficientes si las variables existen.
if (!credentials) {
     console.error("Error grave: Las credenciales de Google no pudieron ser cargadas.");
     process.exit(1);
}

console.log('Valor de la variable credentials antes de GoogleAuth:', credentials);
const auth = new google.auth.GoogleAuth({
    credentials,
    // ASEGÚRATE DE INCLUIR AMBOS SCOPES
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
});

// Obtenemos instancias de ambas APIs
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth }); // INSTANCIA DE LA API DE DRIVE

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const sheetRange = process.env.GOOGLE_SHEET_RANGE; // Cambié el nombre a sheetRange para evitar confusión

// --- Configuración de Google Drive Específica ---
// Define el ID de una carpeta principal en Drive donde quieres que se creen las carpetas por pedido.
// Crea una carpeta en tu Google Drive manualmente (ej. "Solicitudes Bot Discord") y copia su ID de la URL.
const parentDriveFolderId = process.env.PARENT_DRIVE_FOLDER_ID;
if (!parentDriveFolderId) {
     console.warn("Advertencia: PARENT_DRIVE_FOLDER_ID no configurado en .env. Los archivos se subirán a la raíz de Drive de la cuenta de servicio.");
}


// --- Manejo Temporal de Archivos Adjuntos ---
// Usaremos un Map para guardar los archivos adjuntos mientras esperamos el Modal.
// La clave será el ID de la interacción inicial del comando.
const pendingAttachments = new Map();


// --- Eventos del Bot de Discord ---

// ... (client.once('ready', ...)) ...
// ... (client.on('messageCreate', ...)) ... // Puedes mantenerlo o quitarlo si solo usas comandos

// --- Manejar Interacciones (Comandos, Botones, Modals, etc.) ---
client.on('interactionCreate', async interaction => {
    if (interaction.user.bot) return;

    // --- Manejar Comandos de Barra (Slash Commands) ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'solicitud') {
             console.log(`Comando /solicitud recibido por ${interaction.user.tag}.`);

             // ** GUARDAR ARCHIVOS ADJUNTOS SI EXISTEN **
             const attachments = interaction.attachments;
             if (attachments && attachments.size > 0) {
                 console.log(`Archivos adjuntos detectados: ${attachments.size}`);
                 // Guarda el Map de attachments usando el ID de la interacción inicial como clave.
                 pendingAttachments.set(interaction.id, attachments);
                 // Opcional: Establecer un temporizador para limpiar el caché si el usuario no envía el modal
                 // setTimeout(() => pendingAttachments.delete(interaction.id), 1000 * 60 * 5); // Limpiar después de 5 minutos
             } else {
                 console.log('No hay archivos adjuntos en este comando.');
             }


            // !!! MOSTRAR EL MODAL !!!
            try {
                const modal = buildSolicitudModal();
                // Para enlazar el modal con la interacción inicial (y sus attachments),
                // podemos añadir el interaction.id al customId del modal, pero customId tiene un límite de 100 caracteres.
                // Una forma más limpia es confiar en que el modalSubmit interaction tendrá la propiedad original_interaction_id
                // o simplemente usar el cache basado en user.id (menos seguro si el mismo user abre varios modals rápido).
                // Sigamos con el cache por interaction.id por ahora, es más preciso.
                await interaction.showModal(modal);
                console.log('Modal de solicitud mostrado.');

            } catch (error) {
                console.error('Error al mostrar el modal:', error);
                await interaction.reply({ content: 'Hubo un error al abrir el formulario de solicitud.', ephemeral: true });
                // Limpiar attachments pendientes si falló el modal
                pendingAttachments.delete(interaction.id);
            }
        } else {
            // Manejar otros comandos
            // await interaction.reply({ content: 'Comando desconocido.', ephemeral: true }); // Evita responder a comandos no manejados si tienes otros bots
        }
    }

    // --- Manejar Submisiones de Modals ---
    if (interaction.isModalSubmit()) {
        // Asegúrate de que es nuestro modal de solicitud
        if (interaction.customId === 'solicitudModal') {
             console.log(`Submisión del modal de solicitud recibida por ${interaction.user.tag}.`);

             // Deferir la respuesta para tener tiempo (subir a Drive puede tardar)
             await interaction.deferReply({ ephemeral: true });

             // !!! RECUPERAR DATOS DEL MODAL !!!
             const pedido = interaction.fields.getTextInputValue('pedidoInput');
             const caso = interaction.fields.getTextInputValue('casoInput');
             const email = interaction.fields.getTextInputValue('emailInput');
             // Si añadiste descripción al modal:
             // const descripcion = interaction.fields.getTextInputValue('descripcionInput');


             // !!! RECUPERAR ARCHIVOS ADJUNTOS PENDIENTES !!!
             // Aquí está el desafío: ¿Cómo obtenemos el ID de la interacción *inicial* que abrió este modal?
             // Discord.js no siempre lo pasa directamente en la interacción de modalSubmit de forma obvia.
             // Una forma sencilla (pero imperfecta) es usar el cache por user.id si sabes que un user no abre 2 modals a la vez.
             // Una forma mejor es que, si deferredReply() se llamó en el comando inicial, la interacción modalSubmit puede tener info linked,
             // o podrías pasar el interaction.id original en el customId del modal si no excede el límite.
             // Para mantenerlo simple por ahora, vamos a asumir que podemos recuperarlos.
             // ********* Simplificación: Asumiremos que la interacción de modalSubmit tiene una forma de referenciar la original *********
             // Una forma común es que interaction.message pueda estar vinculado a la respuesta del comando inicial si se respondió con un mensaje temporal antes de mostrar el modal.
             // O si usamos interaction.id del modal submit como clave si es consistente (no lo es).
             // Vamos a usar el ID del USUARIO como clave temporal en el Map `pendingAttachments`. Esto tiene riesgo si un mismo usuario abre 2 modals a la vez, pero es más fácil.

             const attachments = pendingAttachments.get(interaction.user.id); // <<-- CAMBIO CLAVE: Recuperar por User ID

             // Limpiar el caché inmediatamente después de intentar recuperarlos
             pendingAttachments.delete(interaction.user.id);


             // Obtener la fecha/hora actual
             const fechaHoraActual = new Date();
             const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                 year: 'numeric', month: '2-digit', day: '2-digit',
                 hour: '2-digit', minute: '2-digit', second: '2-digit',
                 hour12: false
             }).replace(/\//g, '-');

             // Construir el array de datos para la fila del Sheet
             // Orden: "N° de pedido", "Fecha/Hora", "Caso", "Email" (y Descripción si se añadió)
             const rowData = [
                 pedido,
                 fechaHoraFormateada,
                 `#${caso}`, // Incluir el # si lo deseas
                 email
                 // descripcion si se añadió
             ];

             console.log('Datos extraídos del modal:', rowData);
             console.log(`Archivos adjuntos recuperados (si existían): ${attachments ? attachments.size : 0}`);

             // --- Procesar Archivos y Escribir en Google Sheets ---
             let driveFolderLink = null; // Para guardar el link de la carpeta de Drive

             try {
                 // 1. Escribir en Google Sheets primero (suele ser más rápido)
                 await sheets.spreadsheets.values.append({
                     spreadsheetId: spreadsheetId,
                     range: sheetRange,
                     valueInputOption: 'USER_ENTERED',
                     insertDataOption: 'INSERT_ROWS',
                     resource: { values: [rowData] },
                 });
                 console.log('Datos de Sheet agregados.');

                 // 2. Procesar y subir archivos a Google Drive si hay adjuntos
                 if (attachments && attachments.size > 0) {
                     console.log('Iniciando subida de archivos a Google Drive...');
                     // Nombre de la carpeta en Drive (usar el número de pedido)
                     const driveFolderName = `Pedido_${pedido}`;

                     // Encontrar o crear la carpeta de destino en Drive
                     const folderId = await findOrCreateDriveFolder(drive, parentDriveFolderId, driveFolderName);
                     console.log(`Carpeta de Drive (ID: ${folderId}) encontrada o creada para el pedido ${pedido}.`);

                     // Subir cada archivo adjunto a la carpeta encontrada/creada
                     const uploadPromises = attachments.map(attachment =>
                         uploadFileToDrive(drive, folderId, attachment)
                     );
                     const uploadedFiles = await Promise.all(uploadPromises);
                     console.log(`Archivos subidos a Drive: ${uploadedFiles.map(f => f.name).join(', ')}`);

                     // Opcional: Obtener el enlace a la carpeta creada/encontrada
                     if (folderId) {
                          // Para obtener el enlace, necesitamos los permisos correctos (drive.metadata o drive)
                          const folderMeta = await drive.files.get({
                               fileId: folderId,
                               fields: 'webViewLink' // Solicita solo el campo del enlace web
                          });
                          driveFolderLink = folderMeta.data.webViewLink;
                          console.log("Enlace a la carpeta de Drive:", driveFolderLink);
                     }

                 } else {
                    console.log('No hay archivos adjuntos para subir a Drive.');
                 }


                 // --- Responder al usuario con el resultado ---
                 let confirmationMessage = '✅ Solicitud cargada correctamente en Google Sheets.';
                 if (attachments && attachments.size > 0) {
                      confirmationMessage += ` Se ${attachments.size === 1 ? 'subió' : 'subieron'} ${attachments.size} ${attachments.size === 1 ? 'archivo' : 'archivos'} a Google Drive.`;
                      if (driveFolderLink) {
                           confirmationMessage += ` Carpeta: ${driveFolderLink}`;
                      }
                 }

                 await interaction.editReply({ content: confirmationMessage, ephemeral: true });


             } catch (error) {
                 console.error('Error general durante el procesamiento de la solicitud (Sheet o Drive):', error);
                 // Responder al usuario con el error
                 await interaction.editReply({ content: '❌ Hubo un error al procesar tu solicitud (algunos datos o archivos no pudieron cargarse). Por favor, inténtalo de nuevo o contacta a un administrador.', ephemeral: true });
                 // Logging más detallado del error
             }

        }
        // ... manejar otros modals ...
    }
    // ... manejar otros tipos de interacciones ...
});


// --- Funciones de Ayuda para Google Drive ---

/**
 * Busca una carpeta en Google Drive por nombre dentro de una carpeta padre.
 * Si no existe, la crea.
 * @param {object} drive - Instancia de la API de Google Drive.
 * @param {string} parentId - ID de la carpeta padre donde buscar/crear. Si es null/undefined, busca/crea en la raíz.
 * @param {string} folderName - Nombre de la carpeta a buscar/crear.
 * @returns {Promise<string>} - Promesa que resuelve con el ID de la carpeta.
 */
async function findOrCreateDriveFolder(drive, parentId, folderName) {
    try {
        // Buscar la carpeta existente
        let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        if (response.data.files.length > 0) {
            // Carpeta encontrada, retornar su ID
            console.log(`Carpeta '${folderName}' encontrada.`);
            return response.data.files[0].id;
        } else {
            // Carpeta no encontrada, crearla
            console.log(`Carpeta '${folderName}' no encontrada. Creando...`);
            const fileMetadata = {
                'name': folderName,
                'mimeType': 'application/vnd.google-apps.folder',
                 // Si parentId existe, añadirlo a la lista de padres
                 ...(parentId && { parents: [parentId] })
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                fields: 'id' // Solicita solo el ID de la carpeta creada
            });
            console.log(`Carpeta '${folderName}' creada con ID: ${file.data.id}`);
            return file.data.id;
        }
    } catch (error) {
         console.error(`Error al buscar o crear la carpeta '${folderName}' en Drive:`, error);
         throw error; // Relanzar el error para manejarlo en el código principal
    }
}

/**
 * Descarga un archivo desde una URL y lo sube a Google Drive.
 * @param {object} drive - Instancia de la API de Google Drive.
 * @param {string} folderId - ID de la carpeta donde subir el archivo.
 * @param {object} attachment - Objeto Attachment de discord.js.
 * @returns {Promise<object>} - Promesa que resuelve con los metadatos del archivo subido.
 */
async function uploadFileToDrive(drive, folderId, attachment) {
     try {
         console.log(`Descargando archivo: <span class="math-inline">\{attachment\.name\} \(</span>{attachment.url})...`);
         const fileResponse = await fetch(attachment.url);

         if (!fileResponse.ok) {
             throw new Error(`Error al descargar el archivo: ${fileResponse.statusText}`);
         }

         const fileMetadata = {
             name: attachment.name,
             parents: [folderId], // Subir a la carpeta especificada
         };
         const media = {
             mimeType: fileResponse.headers.get('content-type') || 'application/octet-stream', // Usa el tipo MIME de la respuesta o un genérico
             body: fileResponse.body, // El stream del cuerpo de la respuesta
         };

         console(`Subiendo archivo ${attachment.name} a Drive...`);
         const uploadedFile = await drive.files.create({
             resource: fileMetadata,
             media: media,
             fields: 'id, name', // Solicita ID y nombre del archivo subido
             // Ensure you have write permission to the folderId
         });

         console.log(`Archivo subido: ${uploadedFile.data.name} (ID: ${uploadedFile.data.id})`);
         return uploadedFile.data; // Retorna los metadatos del archivo subido

     } catch (error) {
         console.error(`Error al descargar o subir el archivo ${attachment.name}:`, error);
         throw error; // Relanzar el error
     }
}


// ... (buildSolicitudModal function remains the same or updated with description field) ...

// !!! Actualizar buildSolicitudModal si agregaste descripción !!!
function buildSolicitudModal() {
     const modal = new ModalBuilder()
         .setCustomId('solicitudModal')
         .setTitle('Registrar Nueva Solicitud');

     const pedidoInput = new TextInputBuilder()
         .setCustomId('pedidoInput')
         .setLabel("Número de Pedido")
         .setStyle('Short')
         .setRequired(true);

     const casoInput = new TextInputBuilder()
         .setCustomId('casoInput')
         .setLabel("Número de Caso")
         .setStyle('Short')
         .setRequired(true);

     const emailInput = new TextInputBuilder()
         .setCustomId('emailInput')
         .setLabel("Email del Cliente")
         .setStyle('Short')
         .setRequired(true);

     // Agregamos el campo de Descripción
     const descripcionInput = new TextInputBuilder()
         .setCustomId('descripcionInput')
         .setLabel("Detalle de la Solicitud")
         .setStyle('Paragraph') // Campo de texto largo
         .setRequired(false); // Puede que no siempre sea necesaria

     const firstRow = new ActionRowBuilder().addComponents(pedidoInput);
     const secondRow = new ActionRowBuilder().addComponents(casoInput);
     const thirdRow = new ActionRowBuilder().addComponents(emailInput);
     const fourthRow = new ActionRowBuilder().addComponents(descripcionInput); // Nueva fila para descripción

     modal.addComponents(firstRow, secondRow, thirdRow, fourthRow); // Añadir todas las filas

     return modal;
 }