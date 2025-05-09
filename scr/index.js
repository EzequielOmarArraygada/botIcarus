
// --- Importaciones de discord.js ---
import { Client, GatewayIntentBits } from 'discord.js';

// --- Importación del archivo de configuración ---
import config from './config.js';

// --- Importaciones de utilidades ---
import { initializeGoogleSheets, checkSheetForErrors, checkIfPedidoExists } from './utils/googleSheets.js';
import { initializeGoogleDrive, findOrCreateDriveFolder, uploadFileToDrive } from './utils/googleDrive.js';
import { getAndreaniTracking } from './utils/andreani.js';

// --- Importaciones de interacciones (solo las funciones de construcción) ---
import { buildFacturaAModal, buildCasoModal } from './interactions/modals.js';
import { buildTipoSolicitudSelectMenu } from './interactions/selectMenus.js';
// import { buildMyButton } from './interactions/buttons.js'; // Si tienes botones personalizados

// --- Importaciones de manejadores de eventos ---
import setupMessageCreate from './events/messageCreate.js';
import setupInteractionCreate from './events/interactionCreate.js';


// --- Configuración del Cliente de Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// --- Manejo de Estado ---
const userPendingData = new Map();


// --- Inicializar APIs de Google ---
let sheetsInstance;
let driveInstance;
try {
    // Inicializar Sheets y Drive usando las funciones de utilidad importadas
    // Pasamos las credenciales desde el objeto config
    sheetsInstance = initializeGoogleSheets(config.googleCredentialsJson);
    driveInstance = initializeGoogleDrive(config.googleCredentialsJson);
    // Opcional: hacer las instancias globales si te resulta más fácil pasarlas así,
    // pero pasarlas como parámetros a los handlers es una práctica más limpia.
    // global.sheets = sheetsInstance;
    // global.drive = driveInstance;

} catch (error) {
    console.error("Error al inicializar APIs de Google:", error);
    process.exit(1); // Salir si las APIs de Google no se inicializan
}


// --- Eventos del Bot de Discord ---
client.once('ready', async () => {
    console.log(`Bot logeado como ${client.user.tag}!`);
    console.log(`Conectado a Discord.`);
    console.log('Lógica de establecimiento automático de permisos de comandos por canal omitida.');

    // --- Iniciar la verificación periódica de errores en la hoja ---
    if (config.spreadsheetIdCasos && config.sheetRangeCasosRead && config.targetChannelIdCasos && config.guildId) {
        console.log(`Iniciando verificación periódica de errores cada ${config.errorCheckIntervalMs / 1000} segundos.`);
        // Llamar a la función importada y pasarle las dependencias necesarias
        checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId);
        setInterval(() => checkSheetForErrors(client, sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, config.targetChannelIdCasos, config.guildId), config.errorCheckIntervalMs);
    } else {
        console.warn("La verificación periódica de errores no se iniciará debido a la falta de configuración de Google Sheets (ID, rango de lectura) o canal de casos.");
    }
});

// --- Configurar Listeners de Eventos ---
// Llama a las funciones de setup importadas y pásales las variables y funciones necesarias
// Pasamos el objeto config completo y las instancias de las APIs
setupMessageCreate(
    client,
    userPendingData,
    config, // Pasar el objeto de configuración
    driveInstance, // Pasar la instancia de drive
    findOrCreateDriveFolder, // Pasar la función de utilidad
    uploadFileToDrive // Pasar la función de utilidad
);

setupInteractionCreate(
    client,
    userPendingData,
    config, // Pasar el objeto de configuración
    sheetsInstance, // Pasar la instancia de sheets
    driveInstance, // Pasar la instancia de drive
    buildFacturaAModal, // Pasar la función de interacción
    buildTipoSolicitudSelectMenu, // Pasar la función de interacción
    buildCasoModal, // Pasar la función de interacción
    checkIfPedidoExists, // Pasar la función de utilidad
    getAndreaniTracking // Pasar la función de utilidad
    // Pasa otras funciones o variables que necesiten los handlers
);


// --- Conectar el Bot a Discord ---
console.log("Paso 1: Llegamos a la sección de conexión.");
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${config.discordToken ? config.discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`);

client.login(config.discordToken).catch(err => { // Usamos config.discordToken
    console.error("Paso 3: Error al conectar con Discord.", err);
    console.error("Paso 3: Detalles completos del error de login:", err);
    process.exit(1);
});

console.log("Paso 4: client.login() llamado. Esperando evento 'ready' o error.");
