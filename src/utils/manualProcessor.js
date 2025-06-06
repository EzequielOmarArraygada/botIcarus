import mammoth from 'mammoth';
import { downloadFileFromDrive } from './googleDrive.js';

let manualText = null;

/**
 * Función auxiliar para limpiar el texto extraído.
 * Elimina múltiples saltos de línea, tabulaciones y espacios extra.
 * @param {string} text - El texto a limpiar.
 * @returns {string} - El texto limpio.
 */
function cleanExtractedText(text) {
    if (!text) return '';

    // 1. Reemplazar múltiples saltos de línea (3 o más) por solo dos.
    // Esto mantiene el espaciado entre párrafos pero elimina el exceso.
    let cleanedText = text.replace(/\n{3,}/g, '\n\n');

    // 2. Eliminar tabulaciones y reemplazarlas por un solo espacio (o nada, si prefieres)
    // También elimina espacios múltiples entre palabras y los reemplaza por uno solo.
    cleanedText = cleanedText.replace(/[\t ]+/g, ' ');

    // 3. Eliminar espacios al principio y al final de cada línea (trim cada línea)
    // Esto es útil si mammoth deja espacios al inicio de líneas extraídas de tablas, etc.
    cleanedText = cleanedText.split('\n').map(line => line.trim()).join('\n');

    // 4. Eliminar saltos de línea y espacios al inicio y fin del documento
    cleanedText = cleanedText.trim();

    return cleanedText;
}


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

        // --- APLICAR LA LIMPIEZA AQUÍ ---
        manualText = cleanExtractedText(value);
        // --- FIN DE LA LIMPIEZA ---

        console.log(`Manual cargado correctamente. Longitud del texto: ${manualText.length} caracteres.`);
        if (manualText && manualText.length > 0) {
            console.log(`Primeros 200 caracteres del manual (después de procesamiento):\n${manualText.substring(0, 200)}...`);
        } else {
            console.warn("ADVERTENCIA: El manual procesado está vacío después de la limpieza. Revisa el archivo .docx.");
        }

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