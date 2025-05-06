require('dotenv').config(); // Carga variables de entorno

// Necesitamos el ClientId del bot y el Token
const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_TOKEN;

// Si no tienes el ClientId o el Token, no podemos desplegar los comandos
if (!clientId || !token) {
    console.error("Faltan variables de entorno para desplegar comandos: DISCORD_CLIENT_ID o DISCORD_TOKEN.");
    process.exit(1);
}


const { REST, Routes } = require('discord.js');

// --- Definición de tus comandos ---
// Aquí defines la estructura de tus slash commands.
// Para nuestro caso, solo tenemos un comando "/solicitud".
const commands = [
	{
		name: 'solicitud', // El nombre del comando (lo que escribes después de '/')
		description: 'Registra una nueva solicitud en Google Sheets y Drive.', // Descripción que aparece en Discord
        // Aquí podrías añadir opciones si el comando necesitara argumentos directos.
        // Pero como usamos un modal, el comando solo sirve para abrir el formulario.
	},
    // Si tuvieras más comandos, los añadirías aquí en este array.
    // {
    //     name: 'otrocomando',
    //     description: 'Hace otra cosa.',
    // }
];

// --- Proceso de Despliegue ---

// Crea una nueva instancia de REST para interactuar con la API de Discord
const rest = new REST({ version: '10' }).setToken(token); // '10' es la versión común de la API, ajusta si es necesario

// Función asíncrona para realizar el despliegue
(async () => {
	try {
		console.log(`Iniciando despliegue de ${commands.length} comandos de aplicación.`);

		// Despliega los comandos:
        // Puedes desplegarlos GLOBALMENTE (aparecen en todos los servidores donde está el bot, tarda hasta 1 hora)
        // O desplegarlos por GUILD (servidor específico, aparecen casi instantly, útil para pruebas)

        // Opción 1: Despliegue GLOBAL (para cuando tu bot esté listo para muchos servidores)
        // const data = await rest.put(
        //     Routes.applicationCommands(clientId), // Endpoint global
        //     { body: commands },
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


	} catch (error) {
		// Atrapa cualquier error durante el despliegue
		console.error('Error al desplegar comandos:', error);
	}
})(); // Ejecuta la función inmediatamente