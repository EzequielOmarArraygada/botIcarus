import fs from 'fs/promises';
import path from 'path';

// Define una ruta segura al archivo JSON
const dataPath = path.resolve(process.cwd(), 'pendingData.json');

/**
 * Lee y parsea el archivo JSON de datos pendientes.
 * Si el archivo no existe, retorna un objeto vacío.
 * @returns {Promise<object>}
 */
async function readPendingData() {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Si el archivo no existe (ENOENT), es normal. Retornamos un objeto vacío.
        if (error.code === 'ENOENT') {
            return {};
        }
        // Si es otro error, lo mostramos.
        console.error("Error leyendo el archivo de estado:", error);
        throw error;
    }
}

/**
 * Escribe el objeto de datos pendientes en el archivo JSON.
 * @param {object} data
 */
async function writePendingData(data) {
    try {
        await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error escribiendo en el archivo de estado:", error);
        throw error;
    }
}

/**
 * Guarda los datos de un usuario específico.
 * @param {string} userId
 * @param {object} userData
 */
export async function setUserState(userId, userData) {
    const allData = await readPendingData();
    allData[userId] = userData;
    await writePendingData(allData);
}

/**
 * Obtiene los datos de un usuario específico.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUserState(userId) {
    const allData = await readPendingData();
    return allData[userId] || null;
}

/**
 * Elimina los datos de un usuario específico.
 * @param {string} userId
 */
export async function deleteUserState(userId) {
    const allData = await readPendingData();
    if (allData[userId]) {
        delete allData[userId];
        await writePendingData(allData);
    }
}