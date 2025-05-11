// --- Importaciones de discord.js ---
import { Client, GatewayIntentBits } from 'discord.js';

// --- Importación del archivo de configuración ---
import config from './config.js'; // Importamos el objeto config

// --- Importaciones de utilidades ---
import { initializeGoogleSheets, checkSheetForErrors, checkIfPedidoExists } from './utils/googleSheets.js';
import { initializeGoogleDrive, findOrCreateDriveFolder, uploadFileToDrive } from './utils/googleDrive.js';
import { getAndreaniTracking } from './utils/andreani.js';

// --- Importaciones de interacciones (funciones de construcción de modales y select menus) ---
// Asegúrate de importar TODAS las funciones de modales que uses
import { buildFacturaAModal, buildCasoModal} from './interactions/modals.js';
import { buildTipoSolicitudSelectMenu } from './interactions/selectMenus.js';
// import { buildMyButton } from './interactions/buttons.js'; // Si tienes botones personalizados


// --- Importaciones de manejadores de eventos ---
import setupMessageCreate from './events/messageCreate.js';
import setupInteractionCreate from './events/interactionCreate.js';
import setupGuildMemberAdd from './events/guildMemberAdd.js'; // <-- Importamos el nuevo manejador


// --- Configuración del Cliente de Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,         // Necesario para reconocer servidores y comandos, y para obtener displayName
        GatewayIntentBits.GuildMessages,  // Necesario para el listener messageCreate
        GatewayIntentBits.MessageContent, // CRUCIAL para leer el contenido de mensajes, incluyendo adjuntos
        GatewayIntentBits.GuildMembers,   // <-- NECESARIO para el evento guildMemberAdd
    ]
});

// --- Manejo de Estado ---
const userPendingData = new Map();


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
    console.log(`Conectado a Discord.`);
    console.log('Lógica de establecimiento automático de permisos de comandos por canal omitida.');

    // --- Iniciar la verificación periódica de errores en la hoja ---
    // NOTA: Actualmente, la verificación de errores solo está implementada para la hoja principal de Casos (Solicitud BGH).
    // Si necesitas verificar errores en otras hojas (Cancelaciones, Reembolsos, etc.),
    // deberás extender la función checkSheetForErrors en googleSheets.js
    // o crear funciones de verificación separadas para cada hoja y llamarlas aquí.
    if (config.spreadsheetIdCasos && config.sheetRangeCasosRead && config.targetChannelIdCasos && config.guildId) { // Usamos las variables específicas de Casos BGH
        console.log(`Iniciando verificación periódica de errores cada ${config.errorCheckIntervalMs / 1000} segundos en la hoja de Casos BGH.`);
        // Llamar a la función importada y pasarle las dependencias necesarias
        checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId);
        setInterval(() => checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId), config.errorCheckIntervalMs);
    } else {
        console.warn("La verificación periódica de errores en la hoja de Casos BGH no se iniciará debido a la falta de configuración.");
    }

    // Si necesitas verificar errores en Cancelaciones, podrías añadir algo como:
    // if (config.spreadsheetIdCancelaciones && config.sheetRangeCancelacionesRead && config.targetChannelIdCasos && config.guildId) {
    //     console.log(`Iniciando verificación periódica de errores cada ${config.errorCheckIntervalMs / 1000} segundos en la hoja de Cancelaciones.`);
    //     // Deberías tener una función checkSheetForErrorsCancelaciones o modificar la existente
    //     // checkSheetForErrorsCancelaciones(client, sheetsInstance, config.spreadsheetIdCancelaciones, config.sheetRangeCancelacionesRead, config.targetChannelIdCasos, config.guildId);
    //     // setInterval(() => checkSheetForErrorsCancelaciones(client, sheetsInstance, config.spreadsheetIdCancelaciones, config.sheetRangeCancelacionesRead, config.targetChannelIdCasos, config.guildId), config.errorCheckIntervalMs);
    // }


});

// --- Configurar Listeners de Eventos ---
// Llama a las funciones de setup importadas y pásales las variables y funciones necesarias
setupMessageCreate(
    client,
    userPendingData,
    config,
    driveInstance,
    findOrCreateDriveFolder,
    uploadFileToDrive
);

setupInteractionCreate(
    client,
    userPendingData,
    config,
    sheetsInstance,
    driveInstance,
    buildFacturaAModal,
    buildTipoSolicitudSelectMenu,
    buildCasoModal,
    checkIfPedidoExists,
    getAndreaniTracking,
    findOrCreateDriveFolder,
    uploadFileToDrive
);

// --- Configurar Listener para Nuevos Miembros ---
setupGuildMemberAdd(client, config); // <-- Llamamos al nuevo manejador y le pasamos client y config


// --- Conectar el Bot a Discord ---
console.log("Paso 1: Llegamos a la sección de conexión.");
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${config.discordToken ? config.discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`);

client.login(config.discordToken).catch(err => {
    console.error("Paso 3: Error al conectar con Discord.", err);
    console.error("Paso 3: Detalles completos del error de login:", err);
    process.exit(1);
});

console.log("Paso 4: client.login() llamado. Esperando evento 'ready' o error.");
