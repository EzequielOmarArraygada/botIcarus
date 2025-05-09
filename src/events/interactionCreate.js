// Importa las funciones de interacciones y utilidades necesarias
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
// Importa TODAS las funciones de construcción de modales que vayas a usar
import { buildFacturaAModal, buildCasoModal, buildCancelacionModal, buildReembolsoModal } from '../interactions/modals.js'; // <-- Importamos los nuevos modales
import { buildTipoSolicitudSelectMenu } from '../interactions/selectMenus.js';
import { checkIfPedidoExists } from '../utils/googleSheets.js';
import { getAndreaniTracking } from '../utils/andreani.js';
import { findOrCreateDriveFolder, uploadFileToDrive } from '../utils/googleDrive.js';
// Importamos caseTypes desde el archivo de configuración
import { caseTypes } from '../config.js';


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
 * @param {function} buildCasoModal - Función para construir el modal de casos (Solicitud BGH / Cambio Dirección).
 * @param {function} buildCancelacionModal - Función para construir el modal de Cancelación.
 * @param {function} buildReembolsoModal - Función para construir el modal de Reembolso. // <-- Pasar la nueva función
 * @param {function} checkIfPedidoExists - Función para verificar duplicados.
 * @param {function} getAndreaniTracking - Función para obtener tracking de Andreani.
 * @param {function} findOrCreateDriveFolder - Función de utilidad de Drive.
 * @param {function} uploadFileToDrive - Función de utilidad de Drive.
 */
export default (
    client,
    userPendingData,
    config,
    sheetsInstance,
    driveInstance,
    buildFacturaAModal,
    buildTipoSolicitudSelectMenu,
    buildCasoModal,
    buildCancelacionModal,
    buildReembolsoModal, // <-- Recibir la nueva función
    checkIfPedidoExists,
    getAndreaniTracking,
    findOrCreateDriveFolder,
    uploadFileToDrive
) => {
    client.on('interactionCreate', async interaction => {
        if (interaction.user.bot) return;

        // --- Manejar Comandos de Barra (Slash Commands) ---
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'factura-a') {
                 console.log(`Comando /factura-a recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 if (config.targetChannelIdFacA && interaction.channelId !== config.targetChannelIdFacA) {
                      await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdFacA}>.`, ephemeral: true });
                      return;
                 }

                try {
                    const modal = buildFacturaAModal();
                    await interaction.showModal(modal);
                    console.log('Modal de Factura A mostrado al usuario.');

                } catch (error) {
                    console.error('Error al mostrar el modal de Factura A:', error);
                    if (!interaction.replied && !interaction.deferred) {
                         await interaction.reply({ content: 'Hubo un error al abrir el formulario de solicitud de Factura A. Por favor, inténtalo de nuevo.', ephemeral: true });
                    } else {
                         console.error('Error al mostrar modal después de responder/deferir.');
                    }
                    userPendingData.delete(interaction.user.id);
                }
            } else if (interaction.commandName === 'tracking') {
                 console.log(`Comando /tracking recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 if (config.targetChannelIdEnvios && interaction.channelId !== config.targetChannelIdEnvios) {
                     await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdEnvios}>.`, ephemeral: true });
                     return;
                 }

                 await interaction.deferReply({ ephemeral: false });

                 const trackingNumber = interaction.options.getString('numero');
                 console.log(`Número de tracking recibido: ${trackingNumber}`);

                 if (!trackingNumber) {
                     await interaction.editReply({ content: '❌ Debes proporcionar un número de seguimiento.', ephemeral: true });
                     return;
                 }

                 let trackingInfo = null;

                 try {
                     const trackingData = await getAndreaniTracking(trackingNumber, config.andreaniAuthHeader);

                     if (trackingData && trackingData.procesoActual && trackingData.timelines) {
                         const procesoActual = trackingData.procesoActual;
                         const fechaEstimadaDeEntrega = trackingData.fechaEstimadaDeEntrega;
                         let timelines = trackingData.timelines;
                         const numeroAndreani = trackingData.numeroAndreani;

                         trackingInfo = `📦 Estado del tracking **${numeroAndreani || trackingNumber}**:\n`;
                         trackingInfo += `${procesoActual.titulo}`;

                         if (fechaEstimadaDeEntrega) {
                              const cleanFechaDetalle = fechaEstimadaDeEntrega.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '');
                              trackingInfo += ` - ${cleanFechaDetalle}`;
                         }

                         if (timelines && timelines.length > 0) {
                             timelines.sort((a, b) => {
                                 const dateA = a.fechaUltimoEvento ? new Date(a.fechaUltimoEvento).getTime() : 0;
                                 const dateB = b.fechaUltimoEvento ? new Date(b.fechaUltimoEvento).getTime() : 0;
                                 return dateB - dateA;
                             });


                             trackingInfo += '\n\nHistorial:';
                             for (const timeline of timelines) {
                                 if (timeline.traducciones && timeline.traducciones.length > 0) {
                                     const sortedTraducciones = timeline.traducciones.sort((a, b) => {
                                         const dateA = a.fechaEvento ? new Date(a.fechaEvento).getTime() : 0;
                                         const dateB = b.fechaEvento ? new Date(b.fechaEvento).getTime() : 0;
                                         return dateB - dateA;
                                     });

                                     for (const evento of sortedTraducciones) {
                                         const fechaHora = evento.fechaEvento ? new Date(evento.fechaEvento).toLocaleString('es-AR', {
                                             year: 'numeric', month: '2-digit', day: '2-digit',
                                             hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                                         }).replace(/\//g, '-') : '';
                                         const traduccionLimpia = evento.traduccion.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '').replace(/<\/?p>/g, '').replace(/<\/?div>/g, '').replace(/<\/?q>/g, '').replace(/<\/?a.*?>/g, '').replace(/<\/?span>/g, '').trim();
                                         const sucursal = evento.sucursal && evento.sucursal.nombre ? ` (${evento.sucursal.nombre})` : '';

                                         if (fechaHora || traduccionLimpia) {
                                             trackingInfo += `\n- ${fechaHora}: ${traduccionLimpia}${sucursal}`;
                                         }
                                     }
                                 } else if (timeline.titulo) {
                                     const fechaUltimoEvento = timeline.fechaUltimoEvento ? new Date(timeline.fechaUltimoEvento).toLocaleString('es-AR', {
                                         year: 'numeric', month: '2-digit', day: '2-digit',
                                         hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                                     }).replace(/\//g, '-') : '';
                                     trackingInfo += `\n- ${fechaUltimoEvento}: ${timeline.titulo}`;
                                 }
                             }

                             const initialHistoryString = `📦 Estado del tracking **${numeroAndreani || trackingNumber}**:\n${procesoActual.titulo}` + (fechaEstimadaDeEntrega ? ` - ${fechaEstimadaDeEntrega.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '')}` : '') + '\n\nHistorial:';
                             if (trackingInfo === initialHistoryString) {
                                  trackingInfo += '\nSin historial de eventos detallado disponible.';
                             }


                         } else {
                             trackingInfo += '\n\nSin historial de eventos disponible.';
                         }

                         console.log(`Información de tracking extraída y formateada.`);

                     } else {
                         trackingInfo = `😕 No se pudo encontrar la información de tracking en la respuesta de la API para el número **${trackingNumber}**. La estructura de la respuesta podría haber cambiado o el número es incorrecto.`;
                         console.log(`Estructura de respuesta JSON inesperada para ${trackingNumber}.`);
                     }


                 } catch (error) {
                     console.error('Error al consultar la API de tracking de Andreani:', error);
                     trackingInfo = `❌ Hubo un error al consultar el estado del tracking para **${trackingNumber}**. Detalles: ${error.message}`;
                 }

                 await interaction.editReply({ content: trackingInfo, ephemeral: false });
                 console.log('Respuesta de tracking enviada.');

            } else if (interaction.commandName === 'agregar-caso') {
                console.log(`Comando /agregar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                if (config.targetChannelIdCasos && interaction.channelId !== config.targetChannelIdCasos) {
                     await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdCasos}>.`, ephemeral: true });
                     return;
                }

                try {
                    const actionRow = buildTipoSolicitudSelectMenu(); // Usa la función que lee de caseTypes

                    // Guardar el estado pendiente del usuario, indicando que está en el paso 1 del flujo de casos
                    userPendingData.set(interaction.user.id, { type: 'caso', paso: 1 });
                    console.log(`Usuario ${interaction.user.tag} puesto en estado pendiente (caso, paso 1).`);

                    await interaction.reply({
                        content: 'Por favor, selecciona el tipo de solicitud:',
                        components: [actionRow],
                        ephemeral: true,
                    });
                    console.log('Select Menu de Tipo de Solicitud mostrado al usuario.');

                } catch (error) {
                    console.error('Error al mostrar el Select Menu de Tipo de Solicitud:', error);
                     if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Hubo un error al iniciar el formulario de registro de caso. Por favor, inténtalo de nuevo.', ephemeral: true });
                     } else {
                         console.error('Error al mostrar select menu después de responder/deferir.');
                     }
                    userPendingData.delete(interaction.user.id);
                }

            } else if (interaction.commandName === 'buscar-caso') {
                 console.log(`Comando /buscar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 if (config.targetChannelIdBuscarCaso && interaction.channelId !== config.targetChannelIdBuscarCaso) {
                     await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdBuscarCaso}>.`, ephemeral: true });
                     return;
                 }

                 await interaction.deferReply({ ephemeral: false });

                 const numeroPedidoBuscar = interaction.options.getString('pedido');
                 console.log(`Número de pedido a buscar: ${numeroPedidoBuscar}`);

                 if (numeroPedidoBuscar.trim().toLowerCase() === 'número de pedido') {
                      await interaction.editReply({ content: '❌ Por favor, ingresa un **número de pedido real** para buscar, no el nombre de la columna.', ephemeral: true });
                      return;
                 }

                 if (!numeroPedidoBuscar) {
                     await interaction.editReply({ content: '❌ Debes proporcionar un número de pedido para buscar.', ephemeral: false }); // ephemeral: false para que todos vean el resultado
                     return;
                 }

                 if (!config.spreadsheetIdBuscarCaso || config.sheetsToSearch.length === 0) {
                     console.error("Error: Variables de entorno para la búsqueda de casos incompletas.");
                     await interaction.editReply({ content: '❌ Error de configuración del bot: La búsqueda de casos no está configurada correctamente.', ephemeral: false }); // ephemeral: false
                     return;
                 }

                 let foundRows = [];
                 let searchSummary = `Resultados de la búsqueda para el pedido **${numeroPedidoBuscar}**:\n\n`;
                 let totalFound = 0;

                 try {
                     for (const sheetName of config.sheetsToSearch) {
                         console.log(`Buscando en la pestaña: "${sheetName}"`);
                         const range = `${sheetName}!A:Z`;
                         let response;
                         try {
                             response = await sheetsInstance.spreadsheets.values.get({
                                 spreadsheetId: config.spreadsheetIdBuscarCaso,
                                 range: range,
                             });
                         } catch (sheetError) {
                              console.warn(`Error al leer la pestaña "${sheetName}":`, sheetError.message);
                              searchSummary += `⚠️ Error al leer la pestaña "${sheetName}". Podría no existir o no tener permisos.\n`;
                              continue;
                         }

                         const rows = response.data.values;

                         if (!rows || rows.length <= 1) {
                             console.log(`Pestaña "${sheetName}" vacía o solo con encabezados.`);
                             continue;
                         }

                         const headerRow = rows[0];
                         console.log(`Encabezados leídos de la pestaña "${sheetName}":`, headerRow);

                         const pedidoColumnIndex = headerRow.findIndex(header =>
                              header && String(header).trim().toLowerCase() === 'número de pedido'
                         );

                         if (pedidoColumnIndex === -1) {
                             console.warn(`No se encontró la columna "Número de pedido" en la pestaña "${sheetName}".`);
                             searchSummary += `⚠️ No se encontró la columna "Número de pedido" en la pestaña "${sheetName}".\n`;
                             continue;
                         } else {
                             console.log(`Columna "Número de pedido" encontrada en el índice ${pedidoColumnIndex} en la pestaña "${sheetName}".`);
                         }

                         let foundInSheet = 0;
                         for (let i = 1; i < rows.length; i++) {
                             const row = rows[i];
                             const rowNumber = i + 1;

                             if (row.length <= pedidoColumnIndex) {
                                  continue;
                             }

                             const rowPedidoValue = row[pedidoColumnIndex] ? String(row[pedidoColumnIndex]).trim() : '';

                             if (rowPedidoValue.toLowerCase() === numeroPedidoBuscar.toLowerCase()) {
                                 foundRows.push({
                                     sheet: sheetName,
                                     rowNumber: rowNumber,
                                     data: row
                                 });
                                 foundInSheet++;
                                 totalFound++;
                             }
                         }
                         console.log(`Encontrados ${foundInSheet} resultados en la pestaña "${sheetName}".`);
                     }

                     if (foundRows.length > 0) {
                         searchSummary += `✅ Se encontraron **${foundRows.length}** coincidencias:\n\n`;

                         let detailedResults = '';
                         for (const found of foundRows) {
                             detailedResults += `**Pestaña:** "${found.sheet}", **Fila:** ${found.rowNumber}\n`;
                             // Mostrar hasta 6 columnas para no exceder el límite de caracteres
                             const displayColumns = found.data.slice(0, Math.min(found.data.length, 6)).join(' | ');
                             detailedResults += `\`${displayColumns}\`\n\n`;
                         }

                         const fullMessage = searchSummary + detailedResults;

                         // Verificar si el mensaje completo excede el límite de caracteres de Discord (2000)
                         if (fullMessage.length > 2000) {
                              // Si es muy largo, enviar solo el resumen y sugerir revisar la hoja
                              await interaction.editReply({ content: searchSummary + "Los resultados completos son demasiado largos para mostrar aquí. Por favor, revisa la hoja de Google Sheets directamente.", ephemeral: false });
                         } else {
                              // Si no excede, enviar el mensaje completo con los detalles
                              await interaction.editReply({ content: fullMessage, ephemeral: false });
                         }

                     } else {
                         searchSummary += '😕 No se encontraron coincidencias en las pestañas configuradas.';
                         await interaction.editReply({ content: searchSummary, ephemeral: false });
                     }

                 } catch (error) {
                     console.error('Error general durante la búsqueda de casos en Google Sheets:', error);
                     let errorMessage = '❌ Hubo un error al realizar la búsqueda de casos.';
                      if (error.response && error.response.data) {
                           if (error.response.data.error && error.response.data.error.message) {
                                errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                           } else if (error.response.data.error && Array.isArray(error.response.data.error.errors) && error.response.data.error.errors.length > 0 && error.response.data.error.errors[0].message) {
                                 errorMessage += ` Error de Google API: ${error.response.data.error.errors[0].message}`;
                            } else {
                                errorMessage += ` Error de Google API: ${error.response.status} ${error.response.statusText}`;
                            }
                       } else {
                            errorMessage += ` Detalles: ${error.message}`;
                       }
                     errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

                     await interaction.editReply({ content: errorMessage, ephemeral: false });
                 }
            }
        }

        // --- Manejar Interacciones de Select Menu ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'casoTipoSolicitudSelect') {
                console.log(`Selección en Select Menu 'casoTipoSolicitudSelect' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                const userId = interaction.user.id;
                const pendingData = userPendingData.get(userId);

                // Verificar si el usuario estaba en el paso 1 del flujo de casos
                if (pendingData && pendingData.type === 'caso' && pendingData.paso === 1) {
                    const selectedCaseTypeValue = interaction.values[0]; // Obtiene el value seleccionado (ej: 'SOLICITUD_BGH' o 'CANCELACION')
                    console.log(`Tipo de Solicitud seleccionado (value): ${selectedCaseTypeValue}`);

                    // --- Buscar la configuración completa para el tipo de caso seleccionado ---
                    const selectedCaseTypeConfig = caseTypes.find(type => type.value === selectedCaseTypeValue);

                    if (!selectedCaseTypeConfig) {
                        console.error(`Error: No se encontró la configuración para el tipo de caso seleccionado: ${selectedCaseTypeValue}`);
                         try {
                             await interaction.update({
                                content: '❌ Error interno: No se encontró la configuración para este tipo de solicitud.',
                                components: [],
                                ephemeral: true,
                             });
                         } catch (updateError) { console.error('Error al enviar mensaje de error de config faltante:', updateError); }
                         userPendingData.delete(userId);
                         return;
                    }

                    // Guardar el estado pendiente del usuario, incluyendo la configuración del tipo de caso
                    userPendingData.set(userId, {
                        type: 'caso',
                        paso: 2,
                        tipoSolicitud: selectedCaseTypeConfig.label, // Guardamos el label para mostrarlo
                        caseTypeConfig: selectedCaseTypeConfig, // <-- Guardamos la configuración completa
                        interactionId: interaction.id
                    });
                    console.log(`Estado pendiente del usuario ${interaction.user.tag} actualizado (caso, paso 2, tipo ${selectedCaseTypeConfig.label}).`);


                    // --- Responder al Select Menu: Editar el mensaje original y añadir un botón ---
                    try {
                        const completeDetailsButton = new ButtonBuilder()
                            .setCustomId('completeCasoDetailsButton')
                            .setLabel('Completar Detalles del Caso')
                            .setStyle(ButtonStyle.Primary);

                        const buttonActionRow = new ActionRowBuilder().addComponents(completeDetailsButton);

                        await interaction.update({
                            content: `Tipo de Solicitud seleccionado: **${selectedCaseTypeConfig.label}**. Haz clic en el botón para completar los detalles.`,
                            components: [buttonActionRow],
                            ephemeral: true,
                        });
                        console.log('Mensaje del Select Menu editado y botón "Completar Detalles" mostrado.');

                    } catch (error) {
                        console.error('Error al responder al Select Menu o mostrar el botón:', error);
                         try {
                            await interaction.followUp({ content: 'Hubo un error al procesar tu selección. Por favor, intenta usar el comando /agregar-caso de nuevo.', ephemeral: true });
                         } catch (fuError) {
                            console.error('Error adicional al intentar followUp después de fallo de update:', fuError);
                         }
                        userPendingData.delete(userId);
                    }

                } else {
                     // Si el usuario interactuó con el Select Menu pero no estaba en el estado esperado
                     console.warn(`Interacción de Select Menu inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                     try {
                         await interaction.update({ // Usamos update() para modificar el mensaje original
                            content: 'Esta selección no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.',
                            components: [], // Remove components
                            ephemeral: true, // Keep it ephemeral
                         });
                     } catch (updateError) {
                         console.error('Error al enviar mensaje de error con update() en Select Menu inesperado:', updateError);
                          // Si update falla, intentamos followUp como último recurso
                          try {
                             await interaction.followUp({ content: 'Esta selección no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar. (Error al actualizar mensaje)', ephemeral: true });
                          } catch (fuError) {
                             console.error('Error adicional al intentar followUp después de fallo de update:', fuError);
                          }
                     }
                     userPendingData.delete(userId); // Limpiar estado por si acaso
                }
            }
        }

        // --- Manejar Interacciones de Botón ---
        if (interaction.isButton()) {
            if (interaction.customId === 'completeCasoDetailsButton') {
                console.log(`Clic en botón 'completeCasoDetailsButton' recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                const userId = interaction.user.id;
                const pendingData = userPendingData.get(userId);

                // Verificar si el usuario estaba en el paso 2 del flujo de casos y tenemos la configuración del tipo de caso
                if (pendingData && pendingData.type === 'caso' && pendingData.paso === 2 && pendingData.caseTypeConfig) {

                    const modalIdToShow = pendingData.caseTypeConfig.modalId; // Obtenemos el ID del modal de la configuración

                    // !!! MOSTRAR EL MODAL CORRESPONDIENTE (Paso 3) !!!
                    let modal;
                    try {
                        // Usamos un switch para llamar a la función de construcción del modal correcta
                        switch (modalIdToShow) {
                            case 'casoModal':
                                modal = buildCasoModal();
                                break;
                            case 'cancelacionModal':
                                modal = buildCancelacionModal();
                                break;
                            case 'reembolsoModal': // <-- Nuevo caso para el modal de Reembolso
                                modal = buildReembolsoModal();
                                break;
                            // Añadir más casos aquí si tienes más tipos de modales
                            default:
                                throw new Error(`Modal ID desconocido en configuración del tipo de caso: ${modalIdToShow}`);
                        }

                        await interaction.showModal(modal);
                        console.log(`Modal con ID '${modalIdToShow}' mostrado al usuario.`);

                         if (interaction.replied) {
                            await interaction.editReply({
                                content: `Tipo de Solicitud seleccionado: **${pendingData.tipoSolicitud}**. Por favor, completa el formulario que apareció.`,
                                components: [],
                                ephemeral: true,
                            });
                         } else if (interaction.deferred) {
                             await interaction.editReply({
                                content: `Tipo de Solicitud seleccionado: **${pendingData.tipoSolicitud}**. Por favor, completa el formulario que apareció.`,
                                components: [],
                                ephemeral: true,
                            });
                         } else {
                            await interaction.update({
                                content: `Tipo de Solicitud seleccionado: **${pendingData.tipoSolicitud}**. Por favor, completa el formulario que apareció.`,
                                components: [],
                                ephemeral: true,
                            });
                         }


                    } catch (error) {
                        console.error('Error al mostrar el Modal correspondiente (Paso 3):', error);
                         if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: 'Hubo un error al abrir el formulario de detalles del caso. Por favor, inténtalo de nuevo.', ephemeral: true });
                         } else {
                             try {
                                 await interaction.editReply({ content: 'Hubo un error al abrir el formulario de detalles del caso. Por favor, inténtalo de nuevo.', ephemeral: true });
                             } catch (editError) {
                                 console.error('Error adicional al intentar editReply después de fallo de showModal:', editError);
                                  try {
                                      await interaction.followUp({ content: 'Hubo un error al abrir el formulario de detalles del caso. Por favor, inténtalo de nuevo. (Error)', ephemeral: true });
                                  } catch (fuError) {
                                      console.error('Error adicional al intentar followUp después de fallo de editReply:', fuError);
                                  }
                             }
                         }
                        userPendingData.delete(userId);
                    }

                } else {
                     console.warn(`Clic en botón inesperado de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                     try {
                         await interaction.update({
                            content: 'Este botón no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.',
                            components: [],
                            ephemeral: true,
                         });
                     } catch (updateError) {
                         console.error('Error al enviar mensaje de error con update() en clic de botón inesperado:', updateError);
                          try {
                             await interaction.followUp({ content: 'Esta botón no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar. (Error al actualizar mensaje)', ephemeral: true });
                          } catch (fuError) {
                             console.error('Error adicional al intentar followUp después de fallo de update:', fuError);
                          }
                     }
                     userPendingData.delete(userId);
                }
            }
        }


        // --- Manejar Sumisiones de Modals ---
        if (interaction.isModalSubmit()) {
             // Deferimos la respuesta inmediatamente para cualquier sumisión de modal
             await interaction.deferReply({ ephemeral: true });

             const userId = interaction.user.id;
             const pendingData = userPendingData.get(userId);

             // Verificar si el usuario estaba en el paso 2 y tiene la configuración del tipo de caso
             if (!pendingData || pendingData.type !== 'caso' || pendingData.paso !== 2 || !pendingData.caseTypeConfig) {
                 console.warn(`Sumisión de modal inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                 try {
                     await interaction.editReply({ content: 'Esta sumisión de formulario no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
                 } catch (editError) { console.error('Error al enviar mensaje de error en sumisión de modal inesperada:', editError); }
                 userPendingData.delete(userId);
                 return;
             }

             const caseTypeConfig = pendingData.caseTypeConfig; // Obtenemos la configuración del tipo de caso
             const tipoSolicitudLabel = pendingData.tipoSolicitud; // Obtenemos el label seleccionado


             // --- VERIFICAR DUPLICADO ANTES DE ESCRIBIR ---
             // Usar la configuración de duplicateCheck del tipo de caso seleccionado
             const duplicateCheckConfig = caseTypeConfig.duplicateCheck;
             let isDuplicate = false;

             // Solo intentar verificar duplicados si la configuración existe y es válida
             if (duplicateCheckConfig && duplicateCheckConfig.sheetId && duplicateCheckConfig.sheetRange && duplicateCheckConfig.columnHeader) {
                  const sheetRangeToCheck = duplicateCheckConfig.sheetRange;
                  const spreadsheetIdToCheck = duplicateCheckConfig.sheetId;
                  // Buscar el campo de pedido en la estructura de datos del modal
                  const pedidoFieldDefinition = caseTypeConfig.rowDataStructure.find(item => item.fieldId && item.sheetColumn.toLowerCase().includes('pedido'));

                  // Si encontramos la definición del campo de pedido en la estructura de datos
                  if (pedidoFieldDefinition) {
                       const pedidoNumberToCheck = interaction.fields.getTextInputValue(pedidoFieldDefinition.fieldId);

                       if (pedidoNumberToCheck) { // Solo verificar si se ingresó un número de pedido
                            console.log(`Verificando duplicado para pedido ${pedidoNumberToCheck} en ${spreadsheetIdToCheck}, rango ${sheetRangeToCheck}...`);
                            try {
                                 isDuplicate = await checkIfPedidoExists(sheetsInstance, spreadsheetIdToCheck, sheetRangeToCheck, pedidoNumberToCheck);

                                 if (isDuplicate) {
                                      console.log(`Pedido ${pedidoNumberToCheck} ya existe. Cancelando registro.`);
                                      await interaction.editReply({ content: `❌ El número de pedido **${pedidoNumberToCheck}** ya se encuentra registrado en la hoja de "${caseTypeConfig.label}".`, ephemeral: true });
                                      userPendingData.delete(userId);
                                      return; // Salir si es un duplicado
                                 }
                                 console.log(`Pedido ${pedidoNumberToCheck} no encontrado como duplicado. Procediendo a registrar.`);

                            } catch (checkError) {
                                 console.error(`Error durante la verificación de duplicado para tipo "${caseTypeConfig.label}":`, checkError);
                                 await interaction.editReply({ content: `⚠️ Hubo un error al verificar si el pedido ya existe para este tipo de caso. Se intentará registrar de todos modos. Detalles: ${checkError.message}`, ephemeral: true });
                                 // No retornamos, continuamos con el registro
                            }
                       } else {
                           console.log(`Campo de pedido vacío para el tipo "${caseTypeConfig.label}". Saltando verificación de duplicados.`);
                       }
                  } else {
                      console.warn(`No se pudo determinar el campo de pedido en rowDataStructure para la verificación de duplicados del tipo "${caseTypeConfig.label}". Saltando verificación.`);
                  }
             } else {
                 console.warn(`Configuración de verificación de duplicados incompleta o faltante para el tipo "${caseTypeConfig.label}". Saltando verificación.`);
             }
             // --- FIN VERIFICACIÓN DUPLICADO ---


             // --- Construir la fila de datos dinámicamente usando rowDataStructure ---
             const rowData = [];
             const fechaHoraActual = new Date();
             const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                 year: 'numeric', month: '2-digit', day: '2-digit',
                 hour: '2-digit', minute: '2-digit', second: '2-digit',
                 hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
             }).replace(/\//g, '-');
             const agenteDiscord = interaction.member ? interaction.member.displayName : interaction.user.username;


             for (const item of caseTypeConfig.rowDataStructure) {
                 if (item.fieldId) {
                     // Si es un campo del modal, obtener su valor
                     const fieldValue = interaction.fields.getTextInputValue(item.fieldId);
                     rowData.push(fieldValue);
                 } else if (item.type === 'timestamp') {
                     // Si es una marca de tiempo, usar la fecha/hora actual
                     rowData.push(fechaHoraFormateada);
                 } else if (item.type === 'discordUser') {
                     // Si es el usuario de Discord, usar su nombre
                     rowData.push(agenteDiscord);
                 } else if (item.type === 'selectedType') {
                     // Si es el tipo seleccionado del menú, usar el label
                     rowData.push(tipoSolicitudLabel);
                 } else {
                     // Si es un tipo desconocido o no especificado, añadir un valor vacío o un placeholder
                     console.warn(`Tipo de dato desconocido en rowDataStructure para "${caseTypeConfig.label}": ${JSON.stringify(item)}. Añadiendo celda vacía.`);
                     rowData.push('');
                 }
             }

             console.log(`Datos a escribir en Sheet para "${caseTypeConfig.label}":`, rowData);


             // --- Escribir en Google Sheets ---
             let sheetSuccess = false;
             try {
                 if (caseTypeConfig.sheetId && caseTypeConfig.sheetRange) {
                     console.log(`Intentando escribir en Google Sheets (Tipo: ${caseTypeConfig.label})...`);
                     await sheetsInstance.spreadsheets.values.append({
                         spreadsheetId: caseTypeConfig.sheetId, // Usamos el ID de la hoja del tipo de caso
                         range: caseTypeConfig.sheetRange,   // Usamos el rango del tipo de caso
                         valueInputOption: 'RAW',
                         insertDataOption: 'INSERT_ROWS',
                         resource: { values: [rowData] },
                     });
                     console.log(`Datos de Sheet (Tipo: ${caseTypeConfig.label}) agregados correctamente.`);
                     sheetSuccess = true;
                 } else {
                     console.warn(`Variables de Google Sheets no configuradas para el tipo "${caseTypeConfig.label}". Saltando escritura.`);
                 }

                 let confirmationMessage = '';
                 if (sheetSuccess) {
                     confirmationMessage += `✅ Caso de "${caseTypeConfig.label}" registrado correctamente en Google Sheets.`;
                 } else {
                     confirmationMessage += `❌ El caso de "${caseTypeConfig.label}" no pudo registrarse en Google Sheets (configuración incompleta).`;
                 }

                 await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                 console.log('Confirmación de registro de caso enviada.');

             } catch (error) {
                 console.error(`Error general durante el procesamiento de la sumisión del modal (Tipo: ${caseTypeConfig.label}):`, error);
                 let errorMessage = `❌ Hubo un error al procesar el registro de tu caso de "${caseTypeConfig.label}".`;
                  if (error.response && error.response.data) {
                       if (error.response.data.error && error.response.data.error.message) {
                            errorMessage += ` Error de Google API: ${error.response.data.error.message}`;
                       } else if (error.response.data.error && Array.isArray(error.response.data.error.errors) && error.response.data.error.errors.length > 0 && error.response.data.error.errors[0].message) {
                             errorMessage += ` Error de Google API: ${error.response.data.error.errors[0].message}`;
                        } else {
                             errorMessage += ` Error de Google API: ${error.response.status} ${error.response.statusText}`;
                        }
                   } else {
                        errorMessage += ` Detalles: ${error.message}`;
                   }
                 errorMessage += ' Por favor, inténtalo de nuevo o contacta a un administrador.';

                 await interaction.editReply({ content: errorMessage, ephemeral: true });
                 console.log('Mensaje de error de sumisión de modal enviado.');
             } finally {
                 userPendingData.delete(userId);
                 console.log(`Estado pendiente del usuario ${interaction.user.tag} limpiado.`);
             }
        }
    });
};
