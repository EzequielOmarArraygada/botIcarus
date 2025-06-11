import { SlashCommandBuilder } from 'discord.js'; // Asegúrate de importar SlashCommandBuilder
import { buildFacturaAModal } from '../../interactions/modals.js';

// Define la data del comando
export const data = new SlashCommandBuilder()
    .setName('factura-a')
    .setDescription('Registra una nueva solicitud de Factura A.');

export async function execute(interaction, sheetsInstance, config, userPendingData) { // Cambiado a 'execute'
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