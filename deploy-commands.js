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

// Necesitamos el ID del servidor (Guild ID) para desplegar comandos por servidor
const guildId = process.env.GUILD_ID;
if (!guildId) {
	console.error("Falta GUILD_ID en .env para desplegar comandos por servidor.");
	process.exit(1);
}


// --- Definición de tus comandos ---
// Aquí defines la estructura de tus slash commands.
const commands = [
	{
		name: 'factura-a', // <-- COMANDO RENOMBRADO
		description: 'Registra una nueva solicitud de Factura A en Google Sheets y Drive.', // Descripción actualizada
		// Este comando sigue sin necesitar opciones directas, usa un modal.
	},
    { // Comando /tracking
        name: 'tracking',
        description: 'Consulta el estado de un pedido de Andreani.',
        options: [
            {
                name: 'numero',
                description: 'El número de seguimiento de Andreani.',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    { // --- NUEVO COMANDO: /registrar-caso ---
        name: 'agregar-caso', // Nombre del nuevo comando para casos/devoluciones
        description: 'Registra un nuevo caso de cambio o devolución en Google Sheets.', // Descripción
        // Este comando no necesita opciones directas, usará un modal específico.
    },
	// Si tuvieras más comandos, los añadirías aquí en este array.
];

// --- Proceso de Despliegue ---

// Crea una nueva instancia de REST para interactuar con la API de Discord
const rest = new REST({ version: '10' }).setToken(token); // '10' es la versión común de la API, ajusta si es necesario

// Función asíncrona autoejecutable para realizar el despliegue
(async () => {
	try {
		console.log(`Iniciando despliegue de ${commands.length} comandos de aplicación en el servidor con ID: ${guildId}.`);

		// Despliega los comandos por GUILD (servidor específico)
		const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), // Endpoint por servidor
            { body: commands },
        );

		console.log(`Comandos (${data.length}) desplegados correctamente.`);

        // --- Mostrar los IDs de los comandos desplegados ---
        console.log("IDs de comandos desplegados:");
        data.forEach(command => {
            console.log(`Nombre: ${command.name}, ID: ${command.id}`);
        });
        // NOTA: Necesitarás actualizar tus variables de entorno en Railway
        // con los IDs de 'factura-a' y 'registrar-caso' si cambiaron.


	} catch (error) {
		// Atrapa cualquier error durante el despliegue
		console.error('Error al desplegar comandos:', error);
	}
})(); // Ejecuta la función inmediatamente
