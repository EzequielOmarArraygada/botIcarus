import { google } from 'googleapis';
import fetch from 'node-fetch';

let drive;
let auth; 

/**
 * Inicializa la instancia de Google Drive API.
 * Debe ser llamada una vez al iniciar el bot.
 * @param {string} credentialsJson - El contenido JSON de las credenciales de la cuenta de servicio de Google.
 */
export function initializeGoogleDrive(credentialsJson) {
     try {
        const credentials = JSON.parse(credentialsJson);
        auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'] // Solo scope de Drive
        });
        drive = google.drive({ version: 'v3', auth });
        console.log("Instancia de Google Drive inicializada.");
        // Retornamos la instancia para que pueda ser usada en otros módulos
        return drive;
    } catch (error) {
        console.error("Error al inicializar Google Drive:", error);
        throw error; // Relanzar para manejar en index.js
    }
}


/**
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} parentId - ID de la carpeta padre donde buscar/crear. Si es null/undefined, busca/crea en la raíz del Drive de la cuenta de servicio.
 * @param {string} folderName - Nombre de la carpeta a buscar/crear.
 * @returns {Promise<string>} - Promesa que resuelve con el ID de la carpeta encontrada o creada.
 * @throws {Error} - Lanza un error si falla la búsqueda o creación.
 */
export async function findOrCreateDriveFolder(driveInstance, parentId, folderName) {
    if (!driveInstance || !folderName) {
         console.warn('findOrCreateDriveFolder: Parámetros incompletos.');
         // Dependiendo de la lógica, podrías lanzar un error o retornar null/undefined
         throw new Error("findOrCreateDriveFolder: Parámetros incompletos.");
    }

    try {
        // Construir la query de búsqueda en Drive API
        // Escapar comillas simples en el nombre de la carpeta para evitar problemas en la query
        let query = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
            // Si hay una carpeta padre, buscar solo dentro de ella
            query += ` and '${parentId}' in parents`;
        } else {
             // Si no hay parentId, buscar en la raíz (archivos sin padres)
             query += ` and 'root' in parents`;
        }

        // Listar archivos (carpetas en este caso) que coincidan con la query
        const response = await driveInstance.files.list({ // Usamos driveInstance
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
            const file = await driveInstance.files.create({ // Usamos driveInstance
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
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderId - ID de la carpeta donde subir el archivo.
 * @param {object} attachment - Objeto Attachment de discord.js.
 * @returns {Promise<object>} - Promesa que resuelve con los metadatos (ID y nombre) del archivo subido.
 * @throws {Error} - Lanza un error si falla la descarga o subida.
 */
export async function uploadFileToDrive(driveInstance, folderId, attachment) {
     if (!driveInstance || !folderId || !attachment || !attachment.url || !attachment.name) {
         console.warn('uploadFileToDrive: Parámetros incompletos.');
         throw new Error("uploadFileToDrive: Parámetros incompletos.");
     }

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
         const uploadedFile = await driveInstance.files.create({ // Usamos driveInstance
             resource: fileMetadata, // Metadatos del archivo
             media: media,           // Datos del archivo (contenido)
             fields: 'id, name',     // Campos a retornar del archivo subido
         });

         console.log(`Archivo "${uploadedFile.data.name}" subido con éxito. ID de Drive: ${uploadedFile.data.id}`);
         return uploadedFile.data; // Retornar ID y nombre del archivo subido

     } catch (error) {
         console.error(`Error al descargar o subir el archivo ${attachment.name}:`, error);
         throw error; // Relanzar el error para manejarlo en el try/catch principal de la interacción
     }
}

/**
 * Descarga el contenido de un archivo desde Google Drive.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} fileId - ID del archivo a descargar.
 * @returns {Promise<Buffer>} - Promesa que resuelve con el contenido del archivo como un Buffer.
 */
export async function downloadFileFromDrive(driveInstance, fileId) {
    if (!driveInstance || !fileId) {
        throw new Error("downloadFileFromDrive: Parámetros incompletos.");
    }

    try {
        console.log(`Intentando descargar archivo con ID: ${fileId}`);
        const response = await driveInstance.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' } // Muy importante para obtener el contenido binario
        );

        // El contenido está en response.data
        return Buffer.from(response.data);
    } catch (error) {
        console.error(`Error al descargar el archivo ${fileId} de Drive:`, error);
        throw error;
    }
}
