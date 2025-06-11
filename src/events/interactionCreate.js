import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js'; // Mantener si hay lógica de botones aquí
import { buildFacturaAModal, buildCasoModal } from '../interactions/modals.js'; // Funciones para CONSTRUIR modales
import { buildTipoSolicitudSelectMenu } from '../interactions/selectMenus.js'; // Función para CONSTRUIR select menus

// Importar los manejadores de comandos
import { handleFacturaACommand } from '../interactions/commands/handleFacturaA.js';
import { handleAgregarCasoCommand } from '../interactions/commands/handleAgregarCaso.js';
import { handleAndreaniCommand } from '../interactions/commands/handleAndreani.js';
import { handleManualCommand } from '../interactions/commands/handleManual.js';
import { handleBuscarDriveCommand } from '../interactions/commands/handleBuscarDrive.js';
// Si el comando misCasos.js usa `export default` y no exporta una función específica,
// necesitas importarlo así:
// import misCasosCommand from '../interactions/commands/misCasos.js';
// Y luego en el handler de comandos, usar: client.commands.get(interaction.commandName).execute(...)

// Importar los manejadores de select menus
import { handleCasoTipoSolicitudSelect } from '../interactions/selectMenus/handleCasoTipoSolicitudSelect.js';

// Importar los manejadores de sumisión de modales
import { submitFacturaAModal } from '../interactions/modals/submitFacturaAModal.js';
import { submitCasoModal } from '../interactions/modals/submitCasoModal.js';


/**
 * Configura el listener para el evento interactionCreate.
 * Este manejador procesa comandos de barra, botones, select menus y sumisiones de modales.
 * @param {object} client - Instancia del cliente de Discord (ahora con client.commands).
 * @param {Map} userPendingData - Mapa para datos pendientes del usuario.
 * @param {object} config - Objeto de configuración.
 * @param {object} sheetsInstance - Instancia de la API de Google Sheets.
 * @param {object} driveInstance - Instancia de la API de Google Drive.
 * // Ya no pasamos buildFacturaAModal, buildTipoSolicitudSelectMenu, buildCasoModal aquí directamente,
 * // porque las funciones de manejo de comandos las importan.
 * // Solo pasamos utilidades o instancias de API que todos los manejadores puedan necesitar.
 * @param {function} checkIfPedidoExists - Función de utilidad de Google Sheets. (Aunque ahora handleBuscarDriveCommand lo importa directamente)
 * @param {function} getAndreaniTracking - Función de utilidad de Andreani. (Aunque ahora handleAndreaniCommand lo importa directamente)
 * @param {function} findOrCreateDriveFolder - Función de utilidad de Drive. (Aunque ahora submitFacturaAModal lo importa directamente)
 * @param {function} uploadFileToDrive - Función de utilidad de Drive. (Aunque ahora submitFacturaAModal lo importa directamente)
 * @param {function} getManualText - Función de utilidad del procesador de manual. (Aunque ahora handleManualCommand lo importa directamente)
 * @param {function} getAnswerFromManual - Función de utilidad del servicio de QA. (Aunque ahora handleManualCommand lo importa directamente)
 */
export default (client, userPendingData, config, sheetsInstance, driveInstance) => { // Reducir los parámetros pasados
    client.on('interactionCreate', async interaction => {
        // Manejo de Errores centralizado (o al menos un log)
        const handleError = async (err, interaction, context = "Error general de interacción") => {
            console.error(`${context} para ${interaction.user.tag}:`, err);
            const errorMessage = '❌ Hubo un error al procesar tu solicitud. Por favor, inténtalo de nuevo más tarde.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage, ephemeral: true }).catch(e => console.error("Error al editar la respuesta de error:", e));
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true }).catch(e => console.error("Error al enviar la respuesta de error:", e));
            }
        };

        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No se encontró ningún comando que coincida con ${interaction.commandName}.`);
                return;
            }

            try {
                // Ejecutar el comando. Pasamos las dependencias como parámetros para que cada comando
                // decida cuáles necesita.
                await command.execute(
                    interaction,
                    sheetsInstance,
                    config,
                    userPendingData,
                    driveInstance
                    // Si un comando específico necesita una utilidad (ej. checkIfPedidoExists),
                    // es mejor que la importe directamente en su propio archivo
                    // para mantener el desacoplamiento.
                );
            } catch (error) {
                await handleError(error, interaction, `Error al ejecutar el comando /${interaction.commandName}`);
            }

        } else if (interaction.isButton()) {
            // Manejador para botones
            if (interaction.customId === 'cancel_caso_creation') {
                const userId = interaction.user.id;
                userPendingData.delete(userId);
                await interaction.update({ content: 'Proceso de creación de caso cancelado.', components: [], ephemeral: true });
            } else {
                console.log(`Botón desconocido pulsado: ${interaction.customId}`);
                await interaction.reply({ content: 'Función de botón no reconocida.', ephemeral: true });
            }

        } else if (interaction.isStringSelectMenu()) {
            // Manejador para select menus
            switch (interaction.customId) {
                case 'casoTipoSolicitudSelect':
                    try {
                        await handleCasoTipoSolicitudSelect(interaction, userPendingData, config);
                    } catch (error) {
                        await handleError(error, interaction, `Error al manejar select menu 'casoTipoSolicitudSelect'`);
                    }
                    break;
                default:
                    console.warn(`Select Menu desconocido: ${interaction.customId}`);
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