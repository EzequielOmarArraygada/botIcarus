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
    let folderId = null;
    let pageToken = null;

    let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    // console.log(`DEBUG: findOrCreateDriveFolder query: ${query}`); // Debugging line

    try {
        do {
            const res = await driveInstance.files.list({
                q: query,
                fields: 'nextPageToken, files(id, name)',
                spaces: 'drive',
                pageToken: pageToken,
                corpora: parentId ? 'user' : 'drive', // 'user' para Mi Unidad, 'drive' para Shared Drives
                includeItemsFromAllDrives: true,
                ...(parentId && {driveId: parentId}), // Solo si parentId es un Shared Drive ID
            });

            if (res.data.files.length > 0) {
                folderId = res.data.files[0].id;
                // console.log(`DEBUG: Carpeta encontrada: ${folderName}, ID: ${folderId}`); // Debugging line
                break;
            }
            pageToken = res.data.nextPageToken;
        } while (pageToken);

        if (folderId) {
            return folderId;
        }

        // Si no se encontró, crear la carpeta
        const fileMetadata = {
            'name': folderName,
            'mimeType': 'application/vnd.google-apps.folder'
        };
        if (parentId) {
            fileMetadata.parents = [parentId];
        }

        const folder = await driveInstance.files.create({
            resource: fileMetadata,
            fields: 'id',
            supportsAllDrives: true,
        });

        // console.log(`DEBUG: Carpeta creada: ${folderName}, ID: ${folder.data.id}`); // Debugging line
        return folder.data.id;

    } catch (error) {
        console.error(`Error al buscar o crear la carpeta ${folderName}:`, error);
        throw error;
    }
}


/**
 * Sube un archivo a Google Drive.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderId - ID de la carpeta donde subir el archivo.
 * @param {string} filePath - Ruta local del archivo a subir.
 * @param {string} fileName - Nombre del archivo en Drive.
 * @param {string} mimeType - Tipo MIME del archivo.
 * @returns {Promise<object>} - Promesa que resuelve con los metadatos del archivo subido.
 */
export async function uploadFileToDrive(driveInstance, folderId, filePath, fileName, mimeType) {
    const fileMetadata = {
        'name': fileName,
        parents: [folderId]
    };
    const media = {
        mimeType: mimeType,
        body: require('fs').createReadStream(filePath)
    };

    try {
        const file = await driveInstance.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log('Archivo subido, ID:', file.data.id);
        return file.data;
    } catch (error) {
        console.error('Error al subir el archivo:', error);
        throw error;
    }
}


/**
 * Descarga un archivo de Google Drive.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} fileId - ID del archivo a descargar.
 * @returns {Promise<string>} - Promesa que resuelve con el contenido del archivo como texto.
 */
export async function downloadFileFromDrive(driveInstance, fileId) {
    try {
        const res = await driveInstance.files.get({
            fileId: fileId,
            alt: 'media',
        }, {
            responseType: 'stream'
        });

        return new Promise((resolve, reject) => {
            let data = '';
            res.data.on('data', chunk => {
                data += chunk;
            });
            res.data.on('end', () => {
                resolve(data);
            });
            res.data.on('error', err => {
                reject(err);
            });
        });
    } catch (error) {
        console.error('Error al descargar el archivo:', error);
        throw error;
    }
}


/**
 * Busca carpetas en Google Drive por nombre dentro de una carpeta padre o en la raíz de Mi Unidad.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} folderNameQuery - Nombre de la carpeta a buscar.
 * @param {string} searchRootId - ID de la carpeta padre donde buscar. Si es null/undefined, busca en la raíz de 'Mi Unidad'.
 * @returns {Promise<Array<object>>} - Promesa que resuelve con un array de objetos { name, link } de las carpetas encontradas.
 */
export async function searchFoldersByName(driveInstance, folderNameQuery, searchRootId = null) {
    console.log(`DEBUG: Búsqueda de Drive Query para "${folderNameQuery}" ${searchRootId ? `con ID raíz: ${searchRootId}` : ''}`);
    console.log(`Buscando carpetas que contengan "${folderNameQuery}" en Google Drive...`);

    const folders = [];
    let pageToken = null;

    let query = `mimeType='application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed=false`;
    let listParams = {
        fields: 'nextPageToken, files(id, name, webViewLink)',
        spaces: 'drive',
        pageToken: pageToken,
        supportsAllDrives: true,
    };

    if (searchRootId) {
        console.log('DEBUG: Realizando búsqueda dentro de una carpeta específica en Mi Unidad.');
        // Si se proporciona un searchRootId, es una carpeta normal que queremos buscar dentro.
        // Ahora que la titularidad ha sido cedida, esta carpeta está en "Mi Unidad" del servicio.
        query += ` and '${searchRootId}' in parents`;
        listParams.corpora = 'user'; // Busca en Mi Unidad (incluyendo las carpetas compartidas con el usuario)
        listParams.includeItemsFromAllDrives = true; // Para asegurar que también se incluyen los elementos compartidos
    } else {
        console.log('DEBUG: Realizando búsqueda en la raíz de Mi Unidad / Compartidos conmigo.');
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