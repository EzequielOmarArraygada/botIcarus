// --- Importaciones de discord.js ---
import { Client, GatewayIntentBits } from 'discord.js';

// --- Importación del archivo de configuración ---
import config from './config.js'; // Importamos el objeto config

import { Collection } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Importaciones de utilidades ---
import { initializeGoogleSheets, checkSheetForErrors, checkIfPedidoExists } from './utils/googleSheets.js';
import { initializeGoogleDrive, findOrCreateDriveFolder, uploadFileToDrive, downloadFileFromDrive } from './utils/googleDrive.js';
import { getAndreaniTracking } from './utils/andreani.js';
import { loadAndCacheManual, getManualText } from './utils/manualProcessor.js';
import { getAnswerFromManual } from './utils/qaService.js';

// --- Importaciones de interacciones (funciones de construcción de modales y select menus) ---
// Asegúrate de importar TODAS las funciones de modales que uses
import { buildFacturaAModal, buildCasoModal } from './interactions/modals.js';
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
        GatewayIntentBits.GuildMembers, // Necesario para el evento guildMemberAdd
    ],
});

// Crear una nueva colección para almacenar los comandos
client.commands = new Collection();
// Crear un mapa para almacenar datos pendientes específicos de usuario (ej. para modales)
const userPendingData = new Map();

// Obtener la ruta base del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Inicialización de Google Sheets y Drive ---
let sheetsInstance;
let driveInstance;

// Usar una función asíncrona autoejecutable para manejar await al inicio
(async () => {
    try {
        sheetsInstance = initializeGoogleSheets(config.googleCredentialsJson);
        console.log("Google Sheets inicializado correctamente.");
        driveInstance = initializeGoogleDrive(config.googleCredentialsJson);
        console.log("Google Drive inicializado correctamente.");
        await loadAndCacheManual(driveInstance, config.manualDriveFileId); // Cargar manual al inicio
    } catch (error) {
        console.error("Error crítico al inicializar Google APIs:", error);
        process.exit(1); // Salir si las APIs no se pueden inicializar
    }

    // --- Cargar comandos dinámicamente ---
    const commandsPath = path.join(__dirname, 'interactions', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            // Importa el módulo dinámicamente
            const commandModule = await import(filePath);

            // Determina si es una exportación con nombre (data, execute) o exportación por defecto
            const command = commandModule.default || commandModule; // Para manejar handleMisCasos.js que usa export default

            if (command.data && typeof command.execute === 'function') {
                client.commands.set(command.data.name, command);
                console.log(`Comando cargado: /${command.data.name}`);
            } else {
                console.warn(`[ADVERTENCIA] El comando en ${filePath} le falta una propiedad "data" o "execute" requerida.`);
            }
        } catch (error) {
            console.error(`Error al cargar el comando ${filePath}:`, error);
        }
    }


    // --- Verificación periódica de errores en Google Sheets ---
    if (config.errorCheckIntervalMs && sheetsInstance && config.spreadsheetIdCasos && config.sheetRangeCasosRead && config.targetChannelIdCasos) {
        console.log(`Iniciando verificación periódica de errores en Casos BGH cada ${config.errorCheckIntervalMs / 1000} segundos.`);
        setInterval(() => checkSheetForErrors(sheetsInstance, config.spreadsheetIdCasos, config.sheetRangeCasosRead, client, config.targetChannelIdCasos), config.errorCheckIntervalMs);
    } else {
        console.warn("La verificación periódica de errores en la hoja de Casos BGH no se iniciará debido a la falta de configuración.");
    }
})(); // Fin de la función asíncrona autoejecutable

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
    getAnswerFromManual
);

// --- Configurar Listener para Nuevos Miembros ---
setupGuildMemberAdd(client, config); // <-- Llamamos al nuevo manejador y le pasamos client y config


// --- Conectar el Bot a Discord ---
console.log("Paso 1: Llegamos a la sección de conexión.");
console.log(`Paso 2: Token de Discord cargado (primeros 5 chars): ${config.discordToken ? config.discordToken.substring(0, 5) + '...' : 'TOKEN NO CARGADO'}`);

client.login(config.discordToken).catch(err => {
    console.error("Paso 3: Error al conectar con Discord.", err);
    console.error("Paso 3: Detalles completos del error de login:", err);
    process.exit(1); // Salir de la aplicación en caso de fallo de conexión
});

client.once('ready', () => {
    console.log(`Paso 4: ¡Bot ${client.user.tag} conectado a Discord!`);
    console.log(`ID del bot: ${client.user.id}`);
});

client.on('error', error => {
    console.error('Un error en el cliente de Discord ocurrió:', error);
});

process.on('unhandledRejection', error => {
    console.error('Una promesa no manejada fue rechazada:', error);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM recibido. Cerrando el bot gracefully.');
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT recibido. Cerrando el bot gracefully.');
    client.destroy();
    process.exit(0);
});