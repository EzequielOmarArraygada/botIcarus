// --- Importaciones de discord.js ---
import { Client, GatewayIntentBits } from 'discord.js';

// --- Importación del archivo de configuración ---
import config from './config.js'; // Importamos el objeto config

// --- Importaciones de utilidades ---
import { initializeGoogleSheets, checkSheetForErrors, checkIfPedidoExists } from './utils/googleSheets.js';
import { initializeGoogleDrive, findOrCreateDriveFolder, uploadFileToDrive, downloadFileFromDrive, searchFoldersByName  } from './utils/googleDrive.js';
import { getAndreaniTracking } from './utils/andreani.js';
import { loadAndCacheManual, getManualText } from './utils/manualProcessor.js';
import { getAnswerFromManual } from './utils/qaService.js';

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
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Necesario para acceder al contenido de los mensajes
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers, // Necesario para el evento GuildMemberAdd
    ]
});

// --- Inicialización y Caché del Manual (al inicio) ---
let manualContent = ''; // Variable para almacenar el contenido del manual en caché
async function initManual() {
    try {
        manualContent = await loadAndCacheManual(driveInstance, config.manualDriveFileId);
        console.log('Manual cargado y en caché correctamente.');
    } catch (error) {
        console.error('Error al cargar y cachear el manual:', error);
        // Si el manual no se carga, las funciones dependientes fallarán.
    }
}


// --- Inicialización de Google Sheets y Drive ---
let sheetsInstance;
let driveInstance;
try {
    sheetsInstance = initializeGoogleSheets(config.googleCredentialsJson);
    console.log("Google Sheets inicializado.");
} catch (error) {
    console.error("Error al inicializar Google Sheets en index.js:", error);
    process.exit(1); // Sale si no puede inicializar Sheets
}

try {
    driveInstance = initializeGoogleDrive(config.googleCredentialsJson);
    console.log("Google Drive inicializado.");
    initManual(); // Iniciar carga del manual una vez Drive esté inicializado
} catch (error) {
    console.error("Error al inicializar Google Drive en index.js:", error);
    process.exit(1); // Sale si no puede inicializar Drive
}

// Mapa para mantener el estado de las interacciones pendientes del usuario (ej: para modales de varios pasos)
const userPendingData = new Map();


// --- Listeners de Eventos del Cliente de Discord ---
client.once('ready', async () => {
    console.log(`Bot Icarus está en línea como ${client.user.tag}!`);

    // Registra los comandos globales
    try {
        const commands = [
            {
                name: 'factura-a',
                description: 'Genera una solicitud de factura A para el cliente.',
            },
            {
                name: 'envios',
                description: 'Consulta el estado de un envío por su ID de Andreani.',
                options: [
                    {
                        name: 'id_seguimiento',
                        type: 3, // String type
                        description: 'El ID de seguimiento de Andreani.',
                        required: true,
                    },
                ],
            },
            {
                name: 'agregar-caso',
                description: 'Inicia el proceso para agregar un nuevo caso a la hoja de Google Sheets.',
            },
            {
                name: 'buscar-caso',
                description: 'Busca un caso por palabra clave.',
                options: [
                    {
                        name: 'query',
                        type: 3, // String
                        description: 'Palabra clave a buscar en la hoja de casos.',
                        required: true,
                    },
                ],
            },
            {
                name: 'buscar-modelo',
                description: 'Busca una carpeta de modelo en Google Drive.',
                options: [
                    {
                        name: 'modelo',
                        type: 3, // String type
                        description: 'El nombre o parte del nombre del modelo a buscar.',
                        required: true,
                    },
                ],
            },
            {
                name: 'manual',
                description: 'Pregunta algo al manual de Icarus.',
                options: [
                    {
                        name: 'pregunta',
                        type: 3, // String type
                        description: 'Tu pregunta sobre el manual.',
                        required: true,
                    },
                ],
            },
        ];

        // Registra los comandos globalmente
        await client.application.commands.set(commands);
        console.log('Comandos de barra registrados globalmente.');
    } catch (error) {
        console.error('Error al registrar comandos de barra:', error);
    }

    // Iniciar verificación periódica de errores en la hoja de Casos BGH
    if (config.spreadsheetIdCasos && config.sheetRangeCasosRead && config.errorCheckIntervalMs) {
        setInterval(() => checkSheetForErrors(sheetsInstance, client, config), config.errorCheckIntervalMs);
        console.log(`Verificación periódica de errores en la hoja de Casos BGH iniciada. Intervalo: ${config.errorCheckIntervalMs / 1000} segundos.`);
    } else {
        console.warn("La verificación periódica de errores en la hoja de Casos BGH no se iniciará debido a la falta de configuración.");
    }
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
    uploadFileToDrive,
    getManualText,
    getAnswerFromManual,
    searchFoldersByName, 
);

// --- Configurar Listener para Nuevos Miembros ---
setupGuildMemberAdd(client, config); // <-- Llamamos al nuevo manejador y le pasamos client y config


// --- Conectar el Bot a Discord ---
console.log("Paso 1: Llegamos a la sección de conexión.");
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${config.discordToken ? config.discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`);

client.login(config.discordToken).catch(err => {
    console.error("Fallo al conectar con Discord:", err);
    process.exit(1); // Sale si la conexión falla
});