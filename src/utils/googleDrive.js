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
            scopes: ['https://www.googleapis.com/auth/drive']
        });
        drive = google.drive({ version: 'v3', auth });
        console.log("Instancia de Google Drive inicializada.");
        return drive;
    } catch (error) {
        console.error("Error al inicializar Google Drive:", error);
        throw error;
    }
}


/**
 * Busca una carpeta en Google Drive por nombre dentro de una carpeta padre.
 * Si no existe, la crea.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} parentId - ID de la carpeta padre donde buscar/crear. Si es null/undefined, busca/crea en la raíz del Drive de la cuenta de servicio.
 * @param {string} folderName - Nombre de la carpeta a buscar/crear.
 * @returns {Promise<string>} - Promesa que resuelve con el ID de la carpeta encontrada o creada.
 */
export async function findOrCreateDriveFolder(driveInstance, parentId, folderName) {
    // Primero, intentar encontrar la carpeta existente
    try {
        // Construir la consulta de búsqueda
        // Si hay un parentId, buscar solo dentro de esa carpeta
        const query = parentId
            ? `'<span class="math-inline">\{parentId\}' in parents and name \= '</span>{folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            : `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

        console.log(`Buscando carpeta existente: "${folderName}" en padre: ${parentId || 'raíz'}`);
        const response = await driveInstance.files.list({
            q: query,
            spaces: 'drive',
            fields: 'files(id, name)',
            // No se necesita pageSize aquí ya que esperamos 0 o 1 resultado para un nombre exacto
        });

        if (response.data.files.length > 0) {
            console.log(`Carpeta existente encontrada: "${response.data.files[0].name}" (ID: ${response.data.files[0].id})`);
            return response.data.files[0]; // Retorna la primera carpeta encontrada
        }
    } catch (error) {
        console.error(`Error al buscar carpeta existente "${folderName}":`, error);
        // No relanzar, intentar crear en su lugar
    }

    // Si no se encuentra, crearla
    try {
        console.log(`Creando nueva carpeta: "${folderName}" en padre: ${parentId || 'raíz'}`);
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : [], // Añadir la carpeta padre si se especifica
        };
        const folder = await driveInstance.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink, alternateLink',
        });
        console.log(`Carpeta creada: "${folder.data.name}" (ID: ${folder.data.id})`);
        return folder.data;
    } catch (error) {
        console.error(`Error al crear carpeta "${folderName}":`, error);
        throw error; // Relanzar si falla la creación
    }
}


/**
 * Sube un archivo (adjunto de Discord) a Google Drive.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderId - ID de la carpeta donde subir el archivo.
 * @param {object} attachment - Objeto de adjunto de Discord (contiene url, name, etc.).
 * @returns {Promise<object>} - Promesa que resuelve con los metadatos del archivo subido.
 */
export async function uploadFileToDrive(driveInstance, folderId, attachment) {
    if (!driveInstance || !folderId || !attachment || !attachment.url || !attachment.name) {
        throw new Error("uploadFileToDrive: Parámetros de adjunto incompletos.");
    }

    try {
        console.log(`Descargando adjunto para subir: ${attachment.name}`);
        // Descargar el archivo de Discord
        const response = await fetch(attachment.url);
        if (!response.ok) {
            throw new Error(`Failed to download attachment: ${response.statusText}`);
        }
        const fileBuffer = await response.buffer(); // Obtener el contenido binario del archivo

        // Subir el archivo a Google Drive
        console.log(`Subiendo archivo "${attachment.name}" a la carpeta ID: ${folderId}`);
        const uploadedFile = await driveInstance.files.create({
            requestBody: {
                name: attachment.name,
                parents: [folderId], // Asocia el archivo a la carpeta creada
            },
            media: {
                mimeType: attachment.contentType || 'application/octet-stream', // Usa el tipo MIME del adjunto o un genérico
                body: Buffer.from(fileBuffer), // Envía el buffer del archivo
            },
            fields: 'id, name, webViewLink, alternateLink', // Campos que queremos de vuelta (enlace directo y nombre)
            // Usamos 'fields' para optimizar la respuesta
            // Puedes añadir 'uploadType: 'multipart'' si encuentras problemas con archivos grandes,
            // pero fetch() y Buffer.from() generalmente manejan bien el flujo.
            // En Drive API v3, no es necesario 'uploadType: 'resumable'' a menos que sea un archivo muy grande
            // y quieras reanudar subidas. Para adjuntos de Discord, generalmente 'multipart' es suficiente.
            supportsAllDrives: true, // Importante si trabajas con unidades compartidas
            // duplicate: false, // Drive automáticamente maneja nombres duplicados añadiendo un número
            // En este caso, si ya existe un archivo con el mismo nombre, Drive crea uno nuevo
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
        console.error(`Error al descargar archivo con ID ${fileId} de Google Drive:`, error);
        throw error;
    }
}

/**
 * Busca carpetas en Google Drive por nombre que contengan la cadena dada.
 * Puede buscar en "Mi Unidad" o en "Unidades Compartidas".
 * 
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderNameQuery - La cadena de texto a buscar dentro del nombre de la carpeta.
 * @param {string} [parentId=null] - (Opcional) El ID de la carpeta padre para limitar la búsqueda (en Mi Unidad).
 * @param {string} [teamDriveId=null] - (Opcional) El ID de la Unidad Compartida para buscar allí.
 * @returns {Promise<Array<object>>} - Promesa que resuelve con una lista de objetos { name, link } de las carpetas encontradas.
 */

export async function searchFoldersByName(driveInstance, folderNameQuery, teamDriveId = null) {
    console.log(`DEBUG: Búsqueda de Drive Query: "mimeType='application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed=false" ${teamDriveId ? `con teamDriveId: ${teamDriveId}` : ''}`);
    console.log(`Buscando carpetas que contengan "${folderNameQuery}" en Google Drive...`);

    const folders = [];
    let pageToken = null;

    // Construye la query base
    let query = `mimeType='application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed=false`;

    // NO AÑADAS 'in parents' AQUÍ SI teamDriveId ES EL ID DE LA UNIDAD COMPARTIDA
    // La búsqueda en la unidad compartida se controla con los parámetros `corpora` y `driveId`

    do {
        const listParams = {
            q: query,
            fields: 'nextPageToken, files(id, name, webViewLink)',
            spaces: 'drive',
            pageToken: pageToken,
            // --- ¡Estas líneas son correctas y manejan la búsqueda en unidades compartidas! ---
            corpora: teamDriveId ? 'drive' : 'user', // 'drive' para unidades compartidas, 'user' para Mi Unidad
            includeItemsFromAllDrives: teamDriveId ? true : false, // Incluir elementos de todas las unidades
            supportsAllDrives: true, // Importante para usar con corporar=drive
            // --------------------------------------------------------------------------------
        };

        // Si se especifica un teamDriveId (que es el ID de la Unidad Compartida),
        // se debe añadir al listParams como 'driveId'.
        // No lo combines con 'in parents' en la 'q' si teamDriveId es la raíz de la unidad compartida.
        if (teamDriveId) {
            listParams.driveId = teamDriveId;
        }

        const res = await driveInstance.files.list(listParams);
        folders.push(...res.data.files);
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    return folders.map(folder => ({
        name: folder.name,
        link: folder.webViewLink
    }));
}