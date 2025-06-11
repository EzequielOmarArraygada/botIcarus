export async function handleError(error, interaction, customMessage = "Un error inesperado ocurrió.") {
    console.error(`[ERROR]: ${customMessage}`, error);

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `${customMessage}\nDetalles: ${error.message || 'Error desconocido.'}`, ephemeral: true })
            .catch(e => console.error("Error al enviar followUp en handleError:", e));
    } else {
        await interaction.reply({ content: `${customMessage}\nDetalles: ${error.message || 'Error desconocido.'}`, ephemeral: true })
            .catch(e => console.error("Error al enviar reply en handleError:", e));
    }
}