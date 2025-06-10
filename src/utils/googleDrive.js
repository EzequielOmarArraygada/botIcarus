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
 * Busca una carpeta en Google Drive por nombre dentro de una carpeta padre o una Unidad Compartida.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderNameQuery - Nombre de la carpeta a buscar.
 * @param {string} searchRootId - ID de la carpeta padre o de la Unidad Compartida donde buscar.
 * @param {object} config - Objeto de configuración que contiene googleDriveModelsSharedDriveId.
 * @returns {Promise<Array<object>>} - Promesa que resuelve con un array de objetos { name, link } de las carpetas encontradas.
 */
export async function searchFoldersByName(driveInstance, folderNameQuery, searchRootId = null, config) { // AÑADIDO: 'config' como parámetro
    console.log(`DEBUG: Búsqueda de Drive Query para "${folderNameQuery}" ${searchRootId ? `con ID raíz: ${searchRootId}` : ''}`);
    console.log(`Buscando carpetas que contengan "${folderNameQuery}" en Google Drive...`);

    const folders = [];
    let pageToken = null;

    let query = `mimeType='application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed=false`;
    let listParams = {
        fields: 'nextPageToken, files(id, name, webViewLink)',
        spaces: 'drive',
        pageToken: pageToken,
        supportsAllDrives: true, // Esto es bueno mantenerlo
    };

    if (searchRootId) {
        // Determinar si es una Unidad Compartida (Shared Drive) o una carpeta normal
        // Asumimos que si el searchRootId coincide con el ID de la Unidad Compartida de los modelos, es una Unidad Compartida.
        if (config && config.googleDriveModelsSharedDriveId && searchRootId === config.googleDriveModelsSharedDriveId) {
            console.log('DEBUG: Realizando búsqueda en Unidad Compartida.');
            listParams.corpora = 'drive'; // Especifica que la búsqueda es en una Unidad Compartida
            listParams.driveId = searchRootId; // ID de la Unidad Compartida
            listParams.includeItemsFromAllDrives = true; // Para asegurar que también se incluyen los elementos dentro de la Unidad Compartida
            // La query NO necesita 'in parents' cuando se usa driveId.
            // La query se mantiene tal cual: `mimeType='application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed=false`
        } else {
            console.log('DEBUG: Realizando búsqueda en carpeta normal (no Shared Drive).');
            // Es una carpeta normal dentro de 'Mi Unidad' o compartida con el usuario
            query += ` and '${searchRootId}' in parents`;
            listParams.corpora = 'user'; // Busca en Mi Unidad (incluyendo las carpetas compartidas con el usuario)
            listParams.includeItemsFromAllDrives = true; // Para asegurar que también se incluyen los elementos compartidos
        }
    } else {
        console.log('DEBUG: Realizando búsqueda sin ID raíz (Mi Unidad/Compartidos conmigo).');
        // Si no se proporciona un ID raíz, busca en "Mi Unidad" y "Compartidos conmigo" por defecto.
        listParams.corpora = 'user';
        listParams.includeItemsFromAllDrives = true; // Incluir elementos compartidos accesibles por la cuenta de servicio
    }

    listParams.q = query; // Asigna la query construida

    console.log('DEBUG: Parámetros finales de la API de Drive para files.list:', JSON.stringify(listParams, null, 2)); // LOG DE DEBUG
    console.log('DEBUG: Query final de la API de Drive:', query); // LOG DE DEBUG

    try {
        do {
            const res = await driveInstance.files.list(listParams);
            console.log('DEBUG: Respuesta de la API de Drive (archivos encontrados en esta página):', res.data.files); // LOG DE DEBUG
            folders.push(...res.data.files);
            pageToken = res.data.nextPageToken;
            listParams.pageToken = pageToken; // Actualiza pageToken para la siguiente iteración
        } while (pageToken);
    } catch (error) {
        console.error('ERROR: Fallo al listar archivos/carpetas en Google Drive:', error.message);
        throw error; // Re-lanza el error para que sea manejado por el llamador
    }


    console.log(`DEBUG: Se encontraron ${folders.length} carpetas para "${folderNameQuery}".`); // LOG DE DEBUG
    return folders.map(folder => ({
        name: folder.name,
        link: folder.webViewLink
    }));
}
