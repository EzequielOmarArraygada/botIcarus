import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'; // Asegúrate de importar SlashCommandBuilder
import { buildTipoSolicitudSelectMenu } from '../../interactions/selectMenus.js';

// Define la data del comando
export const data = new SlashCommandBuilder()
    .setName('agregar-caso') // El nombre del comando de barra en Discord
    .setDescription('Inicia el proceso para agregar un nuevo caso.');

export async function execute(interaction, sheetsInstance, config, userPendingData) { // Cambiado a 'execute'
    if (interaction.channelId !== config.targetChannelIdCasos) {
        await interaction.reply({
            content: `❌ Este comando solo puede ser usado en el canal <#${config.targetChannelIdCasos}>.`,
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Marca el estado del usuario como "esperando select menu de tipo de solicitud"
    userPendingData.set(interaction.user.id, {
        type: 'caso_tipo_solicitud_pending',
        channelId: interaction.channelId
    });

    const selectMenuRow = buildTipoSolicitudSelectMenu();

    // Crear un botón de cancelar
    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_caso_creation')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Danger);

    const buttonRow = new ActionRowBuilder().addComponents(cancelButton);

    await interaction.editReply({
        content: 'Por favor, selecciona el tipo de solicitud para el caso:',
        components: [selectMenuRow, buttonRow],
        ephemeral: true
    });
    console.log(`Select menu 'Tipo de Solicitud' mostrado a ${interaction.user.tag}.`);
}