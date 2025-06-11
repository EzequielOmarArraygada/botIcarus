import { buildCasoModal } from '../../interactions/modals.js';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

export async function handleCasoTipoSolicitudSelect(interaction, userPendingData, config) {
    await interaction.deferUpdate(); // Deferir la actualización para que el menú no parezca atascado

    const userId = interaction.user.id;
    const selectedTipo = interaction.values[0]; // El valor seleccionado del select menu

    const pendingData = userPendingData.get(userId);

    if (pendingData && pendingData.type === 'caso_tipo_solicitud_pending') {
        // Actualiza el estado pendiente con el tipo de solicitud seleccionado
        userPendingData.set(userId, {
            ...pendingData,
            type: 'caso_modal_pending', // Cambia el estado a esperando modal
            solicitudTipo: selectedTipo
        });

        const casoModal = buildCasoModal();
        await interaction.followUp({ content: `Has seleccionado: **${selectedTipo}**. Por favor, completa los detalles del caso.`, components: [], ephemeral: true }); // Eliminar el select menu
        await interaction.showModal(casoModal); // Mostrar el modal del caso
        console.log(`Modal 'Caso' mostrado a ${interaction.user.tag} después de seleccionar tipo.`);

    } else {
        await interaction.followUp({ content: 'Esta interacción de menú no corresponde a un proceso activo de creación de caso. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
        userPendingData.delete(userId); // Limpiar cualquier estado inconsistente
    }
}