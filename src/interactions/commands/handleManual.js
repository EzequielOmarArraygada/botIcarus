import { SlashCommandBuilder } from 'discord.js'; // Asegúrate de importar SlashCommandBuilder
import { getManualText } from '../../utils/manualProcessor.js';
import { getAnswerFromManual } from '../../utils/qaService.js';

// Define la data del comando
export const data = new SlashCommandBuilder()
    .setName('manual')
    .setDescription('Busca información en el manual de procedimientos.')
    .addStringOption(option =>
        option.setName('pregunta')
            .setDescription('Tu pregunta sobre el manual')
            .setRequired(true));

export async function execute(interaction, config) { // Cambiado a 'execute'
    await interaction.deferReply();

    const question = interaction.options.getString('pregunta');

    if (!config.geminiApiKey || !config.manualDriveFileId) {
        await interaction.editReply({
            content: '❌ Lo siento, la funcionalidad del manual no está configurada (falta la clave de Gemini o el ID del archivo del manual).',
            ephemeral: true
        });
        return;
    }

    const manualText = getManualText();

    if (!manualText) {
        await interaction.editReply({
            content: '❌ Lo siento, el manual no se ha cargado correctamente. Por favor, intenta de nuevo más tarde o contacta a un administrador.',
            ephemeral: true
        });
        return;
    }

    try {
        const answer = await getAnswerFromManual(manualText, question, config.geminiApiKey);
        await interaction.editReply(`**Pregunta:** ${question}\n\n**Respuesta (del manual):**\n${answer}`);
    } catch (error) {
        console.error(`Error al obtener respuesta del manual para "${question}":`, error);
        await interaction.editReply({
            content: '❌ Hubo un error al procesar tu pregunta con el manual. Por favor, inténtalo de nuevo más tarde.',
            ephemeral: true
        });
    }
}