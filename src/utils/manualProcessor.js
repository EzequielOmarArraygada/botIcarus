import mammoth from 'mammoth';
import { downloadFileFromDrive } from './googleDrive.js';

let manualText = null;

/**
 * Carga el manual desde Google Drive, lo convierte a texto plano y lo cachea en memoria.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {string} fileId - ID del archivo .docx del manual en Google Drive.
 */
export async function loadAndCacheManual(driveInstance, fileId) {
    if (!fileId) {
        console.warn("No se proporcionó un ID de archivo de manual para cargar.");
        manualText = null;
        return;
    }

    console.log("Cargando y procesando el manual desde Google Drive...");
    try {
        const fileBuffer = await downloadFileFromDrive(driveInstance, fileId);
        const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        manualText = value;
        console.log(`Manual cargado correctamente. Longitud del texto: ${manualText.length} caracteres.`);
    } catch (error) {
        console.error("Error CRÍTICO al cargar el manual:", error);
        manualText = null; // Asegurarse de que no quede texto viejo si falla la carga
    }
}

/**
 * Retorna el texto del manual que fue cacheado.
 * @returns {string | null}
 */
export function getManualText() {
    return manualText;
}