import 'dotenv/config';

// Cargar y validar variables de entorno
const config = {
    discordToken: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    helpChannelId: process.env.HELP_CHANNEL_ID,

    targetChannelIdFacA: process.env.TARGET_CHANNEL_ID_FAC_A,
    targetChannelIdEnvios: process.env.TARGET_CHANNEL_ID_ENVIOS,
    targetChannelIdCasos: process.env.TARGET_CHANNEL_ID_CASOS,
    targetChannelIdBuscarCaso: process.env.TARGET_CHANNEL_ID_BUSCAR_CASO,

    andreaniAuthHeader: process.env.ANDREANI_API_AUTH,

    googleCredentialsJson: process.env.GOOGLE_CREDENTIALS_JSON,
    spreadsheetIdFacA: process.env.GOOGLE_SHEET_ID_FAC_A,
    sheetRangeFacA: process.env.GOOGLE_SHEET_RANGE_FAC_A,
    spreadsheetIdCasos: process.env.GOOGLE_SHEET_ID_CASOS,
    sheetRangeCasos: process.env.GOOGLE_SHEET_RANGE_CASOS,
    sheetRangeCasosRead: process.env.GOOGLE_SHEET_RANGE_CASOS_READ,
    spreadsheetIdBuscarCaso: process.env.GOOGLE_SHEET_SEARCH_SHEET_ID || process.env.GOOGLE_SHEET_ID_CASOS, 
    sheetsToSearch: process.env.GOOGLE_SHEET_SEARCH_SHEETS ? process.env.GOOGLE_SHEET_SEARCH_SHEETS.split(',').map(s => s.trim()) : [],
    parentDriveFolderId: process.env.PARENT_DRIVE_FOLDER_ID,

    geminiApiKey: process.env.GEMINI_API_KEY, //
    manualDriveFileId: process.env.MANUAL_DRIVE_FILE_ID,

    targetCategoryId: process.env.TARGET_CATEGORY_ID,

errorCheckIntervalMs: process.env.ERROR_CHECK_INTERVAL_MS ? parseInt(process.env.ERROR_CHECK_INTERVAL_MS) : (4 * 60 * 60 * 1000),

};

console.log('[DEBUG] Verificando PARENT_DRIVE_FOLDER_ID al cargar config.js...');
console.log(`[DEBUG] Valor leído de process.env.PARENT_DRIVE_FOLDER_ID: ${process.env.PARENT_DRIVE_FOLDER_ID}`);
// Este log nos dirá si la variable está llegando desde el entorno o no.

// Validaciones básicas (puedes añadir más según sea necesario)
if (!config.discordToken) {
    console.error("Error CRÍTICO: La variable de entorno DISCORD_TOKEN no está configurada.");
    process.exit(1);
}
if (!config.guildId) {
     console.warn("Advertencia: GUILD_ID no configurado. Algunas funcionalidades (como buscar miembros por nombre para notificaciones) podrían no funcionar correctamente.");
}
if (!config.googleCredentialsJson) {
    console.error("Error CRÍTICO: La variable de entorno GOOGLE_CREDENTIALS_JSON no está configurada.");
    process.exit(1);
}

if (!config.geminiApiKey) {
    console.warn("Advertencia: GEMINI_API_KEY no configurada. El comando del manual no funcionará.");
}
if (!config.manualDriveFileId) {
    console.warn("Advertencia: MANUAL_DRIVE_FILE_ID no configurado. El comando del manual no funcionará.");
}

// Validar intervalo de verificación de errores
if (isNaN(config.errorCheckIntervalMs) || config.errorCheckIntervalMs < 10000) { // Mínimo 10 segundos
    console.warn(`ERROR_CHECK_INTERVAL_MS configurado incorrectamente o muy bajo (${process.env.ERROR_CHECK_INTERVAL_MS}). Usando valor por defecto: ${config.errorCheckIntervalMs} ms.`);
    config.errorCheckIntervalMs = 300000; // Reset a 5 minutos si es inválido
}


// Exportar el objeto de configuración
export default config;
