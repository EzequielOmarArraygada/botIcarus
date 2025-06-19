// --- Importaciones de discord.js ---
import { Client, GatewayIntentBits } from 'discord.js';

// --- Importación del archivo de configuración ---
import config from './config.js'; // Importamos el objeto config

// --- Importaciones de utilidades ---
import { initializeGoogleSheets, checkSheetForErrors, checkIfPedidoExists } from './utils/googleSheets.js';
import { initializeGoogleDrive, findOrCreateDriveFolder, uploadFileToDrive, downloadFileFromDrive } from './utils/googleDrive.js';
import { getAndreaniTracking } from './utils/andreani.js';
import { loadAndCacheManual, getManualText } from './utils/manualProcessor.js';
import { getAnswerFromManual } from './utils/qaService.js';

// --- Importaciones de interacciones (funciones de construcción de modales y select menus) ---
import { buildFacturaAModal, buildCasoModal} from './interactions/modals.js';
import { buildTipoSolicitudSelectMenu } from './interactions/selectMenus.js';


// --- Importaciones de manejadores de eventos ---
import setupMessageCreate from './events/messageCreate.js';
import setupInteractionCreate from './events/interactionCreate.js';
// ELIMINADO: import setupGuildMemberAdd from './events/guildMemberAdd.js';


// --- Configuración del Cliente de Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,    ]
});


// --- Inicializar APIs de Google ---
let sheetsInstance;
let driveInstance;
try {
    if (!config.googleCredentialsJson) {
        console.error("Error CRÍTICO: La variable de entorno GOOGLE_CREDENTIALS_JSON no está configurada.");
        process.exit(1);
    }
    sheetsInstance = initializeGoogleSheets(config.googleCredentialsJson);
    driveInstance = initializeGoogleDrive(config.googleCredentialsJson);

} catch (error) {
    console.error("Error al inicializar APIs de Google:", error);
    process.exit(1);
}


// --- Eventos del Bot de Discord ---
client.once('ready', async () => {
    console.log(`Bot logeado como ${client.user.tag}!`);

    // --- Cargar el manual en memoria ---
    if (config.manualDriveFileId && driveInstance) {
        await loadAndCacheManual(driveInstance, config.manualDriveFileId);
    } else {
        console.warn("No se cargará el manual porque falta MANUAL_DRIVE_FILE_ID o la instancia de Drive no está disponible.");
    }

    console.log(`Conectado a Discord.`);

    // --- Iniciar la verificación periódica de errores en la hoja ---
    if (config.spreadsheetIdCasos && config.sheetRangeCasosRead && config.targetChannelIdCasos && config.guildId) {
        console.log(`Iniciando verificación periódica de errores cada ${config.errorCheckIntervalMs / 1000} segundos en la hoja de Casos.`);
        checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId);
        setInterval(() => checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId), config.errorCheckIntervalMs);
    } else {
        console.warn("La verificación periódica de errores no se iniciará debido a la falta de configuración.");
    }
});

// --- Configurar Listeners de Eventos ---
// Llama a las funciones de setup importadas y pásales las variables y funciones necesarias
setupMessageCreate(
    client,
    config,
    driveInstance,
    findOrCreateDriveFolder,
    uploadFileToDrive
);

// CORREGIDO: Se eliminó el parámetro 'userPendingData' que ya no se usa.
setupInteractionCreate(
    client,
    config,
    sheetsInstance,
    driveInstance,
    buildFacturaAModal,
    buildTipoSolicitudSelectMenu,
    buildCasoModal,
    checkIfPedidoExists,
    getAndreaniTracking,
    findOrCreateDriveFolder,
    uploadFileToDrive,
    getManualText,
    getAnswerFromManual
);

// ELIMINADO: La llamada a setupGuildMemberAdd ya no es necesaria.


// --- Conectar el Bot a Discord ---
client.login(config.discordToken).catch(err => {
    console.error("Error al conectar con Discord.", err);
    process.exit(1);
});