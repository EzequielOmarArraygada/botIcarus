/**
 * Configura el listener para el evento guildMemberAdd.
 * Se dispara cuando un nuevo miembro se une a un servidor.
 * @param {object} client - Instancia del cliente de Discord.
 * @param {object} config - Objeto de configuración con IDs de canales, etc.
 */
export default (client, config) => {
    client.on('guildMemberAdd', async member => {
        console.log(`Nuevo miembro unido: ${member.user.tag} (ID: ${member.user.id}) al servidor ${member.guild.name} (ID: ${member.guild.id}).`);

        // Verificar si el servidor donde se unió el miembro es el servidor configurado en el bot
        // Esto es importante si el bot está en múltiples servidores, aunque el tuyo solo esté en uno por ahora.
        if (config.guildId && member.guild.id !== config.guildId) {
            console.log('Nuevo miembro unido a un servidor no configurado. Ignorando saludo.');
            return;
        }

        // Obtener el ID del canal de destino desde la configuración
        const targetChannelId = config.targetChannelIdBuscarCaso; // Usamos el canal de buscar casos como canal general de bienvenida

        // Verificar si el ID del canal de destino está configurado
        if (!targetChannelId) {
            console.warn('TARGET_CHANNEL_ID_BUSCAR_CASO no configurado en .env. No se enviará mensaje de bienvenida.');
            return;
        }

        try {
            // Buscar el canal en la caché del cliente o a través de la API si no está en caché
            const targetChannel = await client.channels.fetch(targetChannelId);

            // Verificar si el canal fue encontrado y es un canal de texto donde se puede enviar mensajes
            if (targetChannel && targetChannel.isTextBased()) {
                // Construir el mensaje de bienvenida
                const welcomeMessage = `¡Bienvenido/a al servidor, ${member}! 🎉 Nos alegra tenerte aquí. Si tienes alguna pregunta, en el canal de guia-comandos-bot vas a encontrar ayuda para lo que necesites.`;

                // Enviar el mensaje al canal de destino
                await targetChannel.send(welcomeMessage);
                console.log(`Mensaje de bienvenida enviado para ${member.user.tag} en el canal ${targetChannel.name}.`);

            } else {
                console.error(`Error: El canal de destino con ID ${targetChannelId} no fue encontrado o no es un canal de texto válido.`);
            }

        } catch (error) {
            console.error(`Error al enviar mensaje de bienvenida para ${member.user.tag}:`, error);
        }
    });
};
