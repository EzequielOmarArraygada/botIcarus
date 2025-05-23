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
    spreadsheetIdBuscarCaso: process.env.GOOGLE_SHEET_SEARCH_SHEET_ID || process.env.GOOGLE_SHEET_ID_CASOS, // Usar el de casos como fallback
    sheetsToSearch: process.env.GOOGLE_SHEET_SEARCH_SHEETS ? process.env.GOOGLE_SHEET_SEARCH_SHEETS.split(',').map(s => s.trim()) : [],
    parentDriveFolderId: process.env.PARENT_DRIVE_FOLDER_ID,

    errorCheckIntervalMs: process.env.ERROR_CHECK_INTERVAL_MS ? parseInt(process.env.ERROR_CHECK_INTERVAL_MS) : 300000, // Default: 5 minutos
};

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

// Validar intervalo de verificación de errores
if (isNaN(config.errorCheckIntervalMs) || config.errorCheckIntervalMs < 10000) { // Mínimo 10 segundos
    console.warn(`ERROR_CHECK_INTERVAL_MS configurado incorrectamente o muy bajo (${process.env.ERROR_CHECK_INTERVAL_MS}). Usando valor por defecto: ${config.errorCheckIntervalMs} ms.`);
    config.errorCheckIntervalMs = 300000; // Reset a 5 minutos si es inválido
}


// Exportar el objeto de configuración
export default config;
