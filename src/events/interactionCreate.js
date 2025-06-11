// Importa las funciones de interacciones y utilidades necesarias
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js'; // Mantener si hay lógica de botones aquí
import { buildFacturaAModal, buildCasoModal } from '../interactions/modals.js'; // Funciones para CONSTRUIR modales
import { buildTipoSolicitudSelectMenu } from '../interactions/selectMenus.js'; // Función para CONSTRUIR select menus

// Importar los manejadores de comandos
// No se importan aquí directamente si los cargas dinámicamente en index.js
// import { handleFacturaACommand } from '../interactions/commands/handleFacturaA.js';
// import { handleAgregarCasoCommand } from '../interactions/commands/handleAgregarCaso.js';
// import { handleAndreaniCommand } from '../interactions/commands/handleAndreani.js';
// import { handleManualCommand } from '../interactions/commands/handleManual.js';
// import { handleBuscarDriveCommand } from '../interactions/commands/handleBuscarDrive.js';
// import misCasosCommand from '../interactions/commands/misCasos.js'; // Si misCasos.js usa `export default`

// Importar los manejadores de select menus
import { handleCasoTipoSolicitudSelect } from '../interactions/selectMenus/handleCasoTipoSolicitudSelect.js';

// Importar los manejadores de sumisión de modales
import { submitFacturaAModal } from '../interactions/modals/submitFacturaAModal.js';
import { submitCasoModal } from '../interactions/modals/submitCasoModal.js';

// Importar la función de manejo de errores
import { handleError } from '../utils/errorHandler.js'; // Asegúrate de tener este archivo o implementa handleError


/**
 * Configura el listener para el evento interactionCreate.
 * Este manejador procesa comandos de barra, botones, select menus y sumisiones de modales.
 * @param {object} client - Instancia del cliente de Discord.
 * @param {Map} userPendingData - Mapa para datos pendientes del usuario.
 * @param {object} config - Objeto de configuración con IDs de canales, IDs de hojas, rangos, etc.
 * @param {object} sheetsInstance - Instancia de la API de Google Sheets.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * @param {function} buildFacturaAModal - Función para construir el modal de Factura A.
 * @param {function} buildTipoSolicitudSelectMenu - Función para construir el select menu de tipo de solicitud.
 * @param {function} buildCasoModal - Función para construir el modal de casos.
 * @param {function} checkIfPedidoExists - Función para verificar si un pedido existe.
 * @param {function} getAndreaniTracking - Función para obtener tracking de Andreani.
 * @param {function} findOrCreateDriveFolder - Función de utilidad de Drive.
 * @param {function} uploadFileToDrive - Función de utilidad de Drive.
 * @param {function} getManualText - Función para obtener el texto del manual.
 * @param {function} getAnswerFromManual - Función para obtener respuesta del manual.
 */
export default (
    client,
    userPendingData,
    config,
    sheetsInstance,
    driveInstance,
    buildFacturaAModal, // Asegúrate de que estas se pasen desde index.js
    buildTipoSolicitudSelectMenu, // Asegúrate de que estas se pasen desde index.js
    buildCasoModal, // Asegúrate de que estas se pasen desde index.js
    checkIfPedidoExists,
    getAndreaniTracking,
    findOrCreateDriveFolder,
    uploadFileToDrive,
    getManualText,
    getAnswerFromManual
) => {
    client.on('interactionCreate', async interaction => {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No se encontró un comando que coincida con ${interaction.commandName}.`);
                return;
            }

            try {
                // Pasa los parámetros necesarios para la ejecución del comando.
                // Adapta esto según las necesidades específicas de cada comando.
                switch (interaction.commandName) {
                    case 'factura-a':
                        await command.execute(interaction, sheetsInstance, config, userPendingData);
                        break;
                    case 'agregar-caso':
                        await command.execute(interaction, sheetsInstance, config, userPendingData);
                        break;
                    case 'andreani':
                        await command.execute(interaction, config);
                        break;
                    case 'manual':
                        await command.execute(interaction, config);
                        break;
                    case 'buscar-drive':
                        await command.execute(interaction, sheetsInstance, config);
                        break;
                    case 'mis-casos':
                        await command.execute(interaction, sheetsInstance, config); // Mis casos necesita sheetsInstance y config
                        break;
                    default:
                        await interaction.reply({ content: 'Comando desconocido.', ephemeral: true });
                        break;
                }
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
                }
            }
        } else if (interaction.isButton()) {
            // Manejador para botones
            // Agrega tu lógica para botones aquí
            if (interaction.customId === 'cancel_caso_creation') {
                const userId = interaction.user.id;
                userPendingData.delete(userId);
                await interaction.reply({ content: 'Creación de caso cancelada.', ephemeral: true });
                console.log(`Creación de caso cancelada para ${interaction.user.tag}. Estado pendiente limpiado.`);
            } else {
                console.warn(`Botón desconocido: ${interaction.customId}`);
                await interaction.reply({ content: 'Este botón no es válido o no está activo.', ephemeral: true });
            }
        } else if (interaction.isStringSelectMenu()) {
            // Manejador para select menus
            switch (interaction.customId) {
                case 'casoTipoSolicitudSelect':
                    try {
                        await handleCasoTipoSolicitudSelect(interaction, userPendingData, buildCasoModal);
                    } catch (error) {
                        await handleError(error, interaction, `Error al manejar select menu 'casoTipoSolicitudSelect'`);
                    }
                    break;
                default:
                    console.warn(`Select menu desconocido: ${interaction.customId}`);
                    await interaction.reply({ content: 'Esta opción de menú no es válida o no está activa.', ephemeral: true });
                    break;
            }

        } else if (interaction.isModalSubmit()) {
            // Manejador para sumisiones de modales
            switch (interaction.customId) {
                case 'facturaAModal':
                    try {
                        await submitFacturaAModal(interaction, sheetsInstance, config, userPendingData, driveInstance);
                    } catch (error) {
                        await handleError(error, interaction, `Error al someter modal 'facturaAModal'`);
                    }
                    break;
                case 'casoModal':
                    try {
                        await submitCasoModal(interaction, sheetsInstance, config, userPendingData);
                    } catch (error) {
                        await handleError(error, interaction, `Error al someter modal 'casoModal'`);
                    }
                    break;
                default:
                    console.warn(`Sumisión de modal desconocida: ${interaction.customId}`);
                    // Intentar responder incluso si el modal es desconocido
                    await interaction.reply({ content: 'Este formulario no es válido o no está activo. Por favor, inténtalo de nuevo.', ephemeral: true }).catch(e => console.error("Error al enviar respuesta a modal desconocido:", e));
                    break;
            }
        }
    });
};