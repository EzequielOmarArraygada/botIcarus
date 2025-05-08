// Carga variables de entorno (forma para Módulos ES)
import 'dotenv/config';

// Importaciones usando sintaxis de Módulos ES
import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';

// Necesitamos el ClientId del bot y el Token
const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;

// Si no tienes el ClientId o el Token, no podemos desplegar los comandos
if (!clientId || !token) {
	console.error("Faltan variables de entorno para desplegar comandos: DISCORD_CLIENT_ID o DISCORD_TOKEN.");
	process.exit(1);
}


// --- Definición de tus comandos ---
// Aquí defines la estructura de tus slash commands.
const commands = [
	{
		name: 'solicitud', // El nombre del comando (lo que escribes después de '/')
		description: 'Registra una nueva solicitud en Google Sheets y Drive.', // Descripción que aparece en Discord
		// Este comando no necesita opciones directas, usa un modal.
	},
    { // --- NUEVO COMANDO: /tracking ---
        name: 'tracking', // Nombre del nuevo comando
        description: 'Consulta el estado de un pedido de Andreani.', // Descripción
        options: [ // Opciones que el usuario debe proporcionar con el comando
            {
                name: 'numero', // Nombre de la opción (ej: /tracking numero: ABC123)
                description: 'El número de seguimiento de Andreani.', // Descripción de la opción
                type: ApplicationCommandOptionType.String, // El tipo de dato esperado (texto)
                required: true, // Esta opción es obligatoria
            },
        ],
    },
	// Si tuvieras más comandos, los añadirías aquí en este array.
];

// --- Proceso de Despliegue ---

// Crea una nueva instancia de REST para interactuar con la API de Discord
const rest = new REST({ version: '10' }).setToken(token); // '10' es la versión común de la API, ajusta si es necesario

// Función asíncrona autoejecutable para realizar el despliegue
(async () => {
	try {
		console.log(`Iniciando despliegue de ${commands.length} comandos de aplicación.`);

		// Despliega los comandos:
		// Puedes desplegarlos GLOBALMENTe (aparecen en todos los servidores donde está el bot, tarda hasta 1 hora)
		// O desplegarlos por GUILD (servidor específico, aparecen casi instantly, útil para pruebas)

		// Opción 1: Despliegue GLOBAL (para cuando tu bot esté listo para muchos servidores)
		// const data = await rest.put(
		// 	Routes.applicationCommands(clientId), // Endpoint global
		// 	{ body: commands },
		// );
		// console.log(`Comandos (${data.length}) desplegados GLOBALMENTE.`);


		// Opción 2: Despliegue por GUILD (recomendado para desarrollo y pruebas)
		// Necesitas el ID del servidor (Guild ID) donde quieres desplegar.
		// Añade GUILD_ID a tu archivo .env
		const guildId = process.env.GUILD_ID;
		if (!guildId) {
			console.error("Falta GUILD_ID en .env para desplegar comandos por servidor.");
			process.exit(1);
		}

		const data = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId), // Endpoint por servidor
    { body: commands },
);
console.log(`Comandos (${data.length}) desplegados en el servidor con ID: ${guildId}.`);

// --- Añadir esto para ver los IDs ---
console.log("IDs de comandos desplegados:");
data.forEach(command => {
    console.log(`Nombre: ${command.name}, ID: ${command.id}`);
});


	} catch (error) {
		// Atrapa cualquier error durante el despliegue
		console.error('Error al desplegar comandos:', error);
	}
})(); // Ejecuta la función inmediatamente
