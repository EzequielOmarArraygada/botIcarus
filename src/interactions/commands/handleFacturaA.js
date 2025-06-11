import { buildFacturaAModal } from '../../interactions/modals.js'; // Ajusta la ruta si es necesario

export async function handleFacturaACommand(interaction, sheetsInstance, config, userPendingData) {
    if (interaction.channelId !== config.targetChannelIdFacA) {
        await interaction.reply({
            content: `❌ Este comando solo puede ser usado en el canal <#${config.targetChannelIdFacA}>.`,
            ephemeral: true
        });
        return;
    }

    // Marca el estado del usuario como "esperando modal de Factura A"
    userPendingData.set(interaction.user.id, {
        type: 'facturaA_modal_pending',
        channelId: interaction.channelId
    });

    const modal = buildFacturaAModal();
    await interaction.showModal(modal);
    console.log(`Modal 'Factura A' mostrado a ${interaction.user.tag}.`);
}