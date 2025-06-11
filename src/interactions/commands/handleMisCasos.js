import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mis-casos')
        .setDescription('Muestra todos los casos que tienes asignados o has creado.'),
    async execute(interaction, sheetsInstance, config) { // Asegúrate de que sheetsInstance y config se pasen
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const userName = interaction.user.username;

        try {
            if (!sheetsInstance) {
                throw new Error("sheetsInstance no está inicializado.");
            }
            if (!config.spreadsheetIdCasos || !config.sheetRangeCasosRead) {
                throw new Error("Configuración de Google Sheets para casos (ID o rango de lectura) incompleta.");
            }

            const response = await sheetsInstance.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetIdCasos,
                range: config.sheetRangeCasosRead,
            });

            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                await interaction.editReply('No se encontraron casos en la hoja de cálculo.');
                return;
            }

            const headers = rows[0];
            const dataRows = rows.slice(1);

            const asesorColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'asesor');
            const creadoPorColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'creado por id');
            const estadoColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'estado');
            const idCasoColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'id caso');
            const fechaCreacionColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'fecha de creacion');
            const resumenColIndex = headers.findIndex(header => header.trim().toLowerCase() === 'resumen');

            if (asesorColIndex === -1 || creadoPorColIndex === -1 || estadoColIndex === -1 || idCasoColIndex === -1) {
                throw new Error("No se pudieron encontrar una o más columnas clave ('Asesor', 'Creado Por ID', 'Estado', 'ID Caso') en la hoja de casos. Por favor, verifica los encabezados.");
            }

            const userCases = dataRows.filter(row => {
                const asesor = row[asesorColIndex];
                const creadoPorId = row[creadoPorColIndex];
                const estado = row[estadoColIndex];

                const isAssigned = asesor && asesor.trim().toLowerCase() === userName.toLowerCase();
                const isCreator = creadoPorId && creadoPorId === userId;
                const isOpen = estado && !['cerrado', 'finalizado', 'resuelto'].includes(estado.trim().toLowerCase());

                return (isAssigned || isCreator) && isOpen;
            });

            if (userCases.length === 0) {
                await interaction.editReply('No tienes casos activos asignados o creados por ti.');
                return;
            }

            let replyMessage = `**Tus Casos Activos (${userCases.length}):**\n\n`;

            userCases.forEach(caseRow => {
                const idCaso = caseRow[idCasoColIndex] || 'N/A';
                const estado = caseRow[estadoColIndex] || 'N/A';
                const asesor = caseRow[asesorColIndex] || 'N/A';
                const fechaCreacion = caseRow[fechaCreacionColIndex] || 'N/A';
                const resumen = resumenColIndex !== -1 ? (caseRow[resumenColIndex] || 'N/A') : 'N/A';

                replyMessage += `**ID Caso:** ${idCaso}\n`;
                replyMessage += `  **Estado:** ${estado}\n`;
                replyMessage += `  **Asesor Asignado:** ${asesor}\n`;
                replyMessage += `  **Fecha de Creación:** ${fechaCreacion}\n`;
                if (resumen !== 'N/A') {
                    replyMessage += `  **Resumen:** ${resumen.substring(0, 100)}${resumen.length > 100 ? '...' : ''}\n`;
                }
                replyMessage += `--------------------\n`;
            });

            if (replyMessage.length > 1900) {
                await interaction.editReply({
                    content: `Tu lista de casos es muy larga. Aquí están los primeros ${userCases.length} casos.`,
                    files: [{
                        attachment: Buffer.from(replyMessage),
                        name: 'mis-casos.txt'
                    }],
                    ephemeral: true
                });
            } else {
                await interaction.editReply({ content: replyMessage, ephemeral: true });
            }

        } catch (error) {
            console.error(`Error al procesar /mis-casos para ${userName}:`, error);
            await interaction.editReply({
                content: `❌ Lo siento, hubo un error al buscar tus casos. Por favor, inténtalo de nuevo más tarde o contacta a un administrador. Detalles: ${error.message}`,
                ephemeral: true
            });
        }
    },
};