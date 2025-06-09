// Importa las funciones de interacciones y utilidades necesarias
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js'; // Necesario para el botón en el select menu handler
import { buildFacturaAModal, buildCasoModal } from '../interactions/modals.js';
import { buildTipoSolicitudSelectMenu } from '../interactions/selectMenus.js'; // Asegúrate de importar buildTipoSolicitudSelectMenu
import { checkIfPedidoExists } from '../utils/googleSheets.js';
import { getAndreaniTracking } from '../utils/andreani.js';
import { findOrCreateDriveFolder, uploadFileToDrive, downloadFileFromDrive, searchFoldersByName } from '../utils/googleDrive.js'; // Necesario para el modal submit handler de Factura A



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
 * @param {function} checkIfPedidoExists - Función para verificar duplicados.
 * @param {function} getAndreaniTracking - Función para obtener tracking de Andreani.
 * @param {function} findOrCreateDriveFolder - Función de utilidad de Drive. // Pasar la función
 * @param {function} uploadFileToDrive - Función de utilidad de Drive. // Pasar la función
 * @param {function} getManualText - Función para obtener el texto del manual.
 * @param {function} getAnswerFromManual - Función para obtener respuestas del manual.
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
    checkIfPedidoExists,
    getAndreaniTracking,
    findOrCreateDriveFolder,
    uploadFileToDrive,
    getManualText, // 
    getAnswerFromManual,
    searchFoldersByName
) => {
    client.on('interactionCreate', async interaction => {
        if (interaction.user.bot) return; // Ignorar interacciones de bots

        

        // --- Manejar Comandos de Barra (Slash Commands) ---
        if (interaction.isChatInputCommand()) {

            // Manejador para el nuevo comando /buscar-modelo
            if (commandName === 'buscar-modelo') {
                // Deferir la respuesta porque la búsqueda puede tardar un poco
                await interaction.deferReply({ ephemeral: true });

                const modelo = interaction.options.getString('modelo');
                console.log(`Comando /buscar-modelo recibido por <span class="math-inline">\{interaction\.user\.tag\}\. Modelo a buscar\: "</span>{modelo}"`);

                try {
                    const foundFolders = await searchFoldersByName(driveInstance, modelo);

                    if (foundFolders.length > 0) {
                        let replyContent = `Se encontraron las siguientes carpetas para el modelo "${modelo}":\n\n`;
                        foundFolders.forEach(folder => {
                            replyContent += `- [<span class="math-inline">\{folder\.name\}\]\(</span>{folder.link})\n`;
                        });
                        // Si la respuesta es muy larga para un solo mensaje, Discord la truncará.
                        // Puedes añadir lógica para dividirla en varios mensajes si es necesario.
                        await interaction.editReply({ content: replyContent, ephemeral: true });
                    } else {
                        await interaction.editReply({ content: `Lo siento, no se encontraron carpetas que contengan "${modelo}" en su nombre.`, ephemeral: true });
                    }
                } catch (error) {
                    console.error(`Error al procesar el comando /buscar-modelo para "${modelo}":`, error);
                    await interaction.editReply({ content: 'Hubo un error al buscar las carpetas en Drive. Por favor, inténtalo de nuevo más tarde.', ephemeral: true });
                }
            }
        
            // Verifica si es el comando "/factura-a"
            if (interaction.commandName === 'factura-a') {
                 console.log(`Comando /factura-a recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 // --- Restricción de canal para /factura-a ---
                 if (config.targetChannelIdFacA && interaction.channelId !== config.targetChannelIdFacA) {
                      await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdFacA}>.`, ephemeral: true });
                      return;
                 }

                // !!! Modal Factura A !!!
                try {
                    const modal = buildFacturaAModal(); // Usamos la función importada
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
            } else if (interaction.commandName === 'tracking') { // --- MANEJADOR PARA /tracking ---
                 console.log(`Comando /tracking recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 // --- Restricción de canal para /tracking ---
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

                 // --- Lógica para consultar el tracking en Andreani usando la API JSON ---
                 let trackingInfo = null;

                 try {
                     const trackingData = await getAndreaniTracking(trackingNumber, config.andreaniAuthHeader);

                     // --- Extraer la información del JSON y formatear ---
                     if (trackingData && trackingData.procesoActual && trackingData.timelines) {
                         const procesoActual = trackingData.procesoActual;
                         const fechaEstimadaDeEntrega = trackingData.fechaEstimadaDeEntrega;
                         let timelines = trackingData.timelines; // Usamos let para poder reasignar después de ordenar
                         const numeroAndreani = trackingData.numeroAndreani;

                         trackingInfo = `📦 Estado del tracking **${numeroAndreani || trackingNumber}**:\n`;
                         trackingInfo += `${procesoActual.titulo}`;

                         if (fechaEstimadaDeEntrega) {
                              const cleanFechaDetalle = fechaEstimadaDeEntrega.replace(/<\/?b>/g, '').replace(/<\/?br>/g, '');
                              trackingInfo += ` - ${cleanFechaDetalle}`;
                         }

                         if (timelines && timelines.length > 0) {
                             // --- Ordenar las etapas principales por fecha del último evento (descendente) ---
                             // Esto ayuda a que las etapas más recientes aparezcan primero
                             timelines.sort((a, b) => {
                                 const dateA = a.fechaUltimoEvento ? new Date(a.fechaUltimoEvento).getTime() : 0;
                                 const dateB = b.fechaUltimoEvento ? new Date(b.fechaUltimoEvento).getTime() : 0;
                                 return dateB - dateA; // Orden descendente
                             });


                             trackingInfo += '\n\nHistorial:';
                             // Iterar sobre cada timeline (cada etapa principal)
                             for (const timeline of timelines) {
                                 if (timeline.traducciones && timeline.traducciones.length > 0) {
                                     // --- Ordenar los eventos detallados (traducciones) por fecha (descendente) ---
                                     const sortedTraducciones = timeline.traducciones.sort((a, b) => {
                                         const dateA = a.fechaEvento ? new Date(a.fechaEvento).getTime() : 0;
                                         const dateB = b.fechaEvento ? new Date(b.fechaEvento).getTime() : 0;
                                         return dateB - dateA; // Orden descendente
                                     });

                                     // Iterar sobre cada traducción/evento dentro de la etapa (ahora ordenados)
                                     for (const evento of sortedTraducciones) { // Usamos el array ordenado
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
                                     // Si no hay traducciones detalladas, al menos mostrar el título de la etapa
                                     const fechaUltimoEvento = timeline.fechaUltimoEvento ? new Date(timeline.fechaUltimoEvento).toLocaleString('es-AR', {
                                         year: 'numeric', month: '2-digit', day: '2-digit',
                                         hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                                     }).replace(/\//g, '-') : '';
                                     trackingInfo += `\n- ${fechaUltimoEvento}: ${timeline.titulo}`;
                                 }
                             }

                             // Verificar si se añadió algo al historial después de iterar
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

            } else if (interaction.commandName === 'agregar-caso') { // MANEJADOR PARA /agregar-caso
                console.log(`Comando /agregar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                // --- Restricción de canal para /agregar-caso ---
                if (config.targetChannelIdCasos && interaction.channelId !== config.targetChannelIdCasos) {
                     await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdCasos}>.`, ephemeral: true });
                     return;
                }

                // --- Iniciar el flujo de 2 pasos: Mostrar Select Menu para Tipo de Solicitud ---
                try {
                    const actionRow = buildTipoSolicitudSelectMenu(); // Usamos la función importada

                    // Guardar el estado pendiente del usuario
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

            } else if (interaction.commandName === 'buscar-caso') { // --- MANEJADOR PARA /buscar-caso ---
                 console.log(`Comando /buscar-caso recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 // --- Restricción de canal para /buscar-caso ---
                 if (config.targetChannelIdBuscarCaso && interaction.channelId !== config.targetChannelIdBuscarCaso) {
                     await interaction.reply({ content: `Este comando solo puede ser usado en el canal <#${config.targetChannelIdBuscarCaso}>.`, ephemeral: true });
                     return;
                 }

                 await interaction.deferReply({ ephemeral: false });

                 const numeroPedidoBuscar = interaction.options.getString('pedido');
                 console.log(`Número de pedido a buscar: ${numeroPedidoBuscar}`);

                 // --- Validar que el valor buscado no sea la frase literal "Número de pedido" ---
                 if (numeroPedidoBuscar.trim().toLowerCase() === 'número de pedido') {
                      await interaction.editReply({ content: '❌ Por favor, ingresa un **número de pedido real** para buscar, no el nombre de la columna.', ephemeral: true });
                      return;
                 }

                 if (!numeroPedidoBuscar) {
                     await interaction.editReply({ content: '❌ Debes proporcionar un número de pedido para buscar.', ephemeral: true });
                     return;
                 }

                 // --- Lógica para buscar en Google Sheets ---
                 if (!config.spreadsheetIdBuscarCaso || config.sheetsToSearch.length === 0) {
                     console.error("Error: Variables de entorno para la búsqueda de casos incompletas.");
                     await interaction.editReply({ content: '❌ Error de configuración del bot: La búsqueda de casos no está configurada correctamente.', ephemeral: true });
                     return;
                 }

                 let foundRows = [];
                 let searchSummary = `Resultados de la búsqueda para el pedido **${numeroPedidoBuscar}**:\n\n`;
                 let totalFound = 0;

                 try {
                     // Iterar sobre cada nombre de sheet especificado
                     for (const sheetName of config.sheetsToSearch) {
                         console.log(`Buscando en la pestaña: "${sheetName}"`);
                         const range = `${sheetName}!A:Z`;
                         let response;
                         try {
                             // Usamos sheetsInstance para la llamada a la API
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

                     // --- Formatear y enviar la respuesta ---
                     if (foundRows.length > 0) {
                         searchSummary += `✅ Se encontraron **${foundRows.length}** coincidencias:\n\n`;

                         let detailedResults = '';
                         for (const found of foundRows) {
                             detailedResults += `**Pestaña:** "${found.sheet}", **Fila:** ${found.rowNumber}\n`;
                             const displayColumns = found.data.slice(0, Math.min(found.data.length, 6)).join(' | ');
                             detailedResults += `\`${displayColumns}\`\n\n`;
                         }

                         const fullMessage = searchSummary + detailedResults;

                         if (fullMessage.length > 2000) {
                              await interaction.editReply({ content: searchSummary + "Los resultados completos son demasiado largos para mostrar aquí. Por favor, revisa la hoja de Google Sheets directamente.", ephemeral: false });
                         } else {
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
            } else if (interaction.commandName === 'manual') { // <--- CAMBIO 2: Bloque de código agregado aquí
                console.log(`Comando /manual recibido por ${interaction.user.tag}.`);

                await interaction.deferReply(); // Responder después, ya que la IA puede tardar

                const pregunta = interaction.options.getString('pregunta');
                console.log(`Pregunta del usuario: "${pregunta}"`);

                const manualText = getManualText();
                if (!manualText) {
                    await interaction.editReply('❌ Error: El manual no está cargado. Por favor, avisa a un administrador.');
                    return;
                }

                try {
                    const respuesta = await getAnswerFromManual(manualText, pregunta, config.geminiApiKey);
                    
                    const respuestaFormateada = `
                        ❓ **Tu pregunta:**\n> ${pregunta}\n
                        📖 **Respuesta del manual:**\n${respuesta}
                    `;
                    
                    await interaction.editReply(respuestaFormateada);
                    console.log("Respuesta del manual enviada correctamente.");

                } catch (error) {
                    console.error("Error al procesar el comando /manual:", error);
                    await interaction.editReply(`❌ Hubo un error al procesar tu pregunta. Inténtalo de nuevo más tarde. (Detalles: ${error.message})`);
                }
            }
        }

        // --- Manejar Interacciones de Select Menu ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'casoTipoSolicitudSelect') {
                console.log(`Selección en Select Menu 'casoTipoSolicitudSelect' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                const userId = interaction.user.id;
                const pendingData = userPendingData.get(userId);

                if (pendingData && pendingData.type === 'caso' && pendingData.paso === 1) {
                    const selectedTipoSolicitud = interaction.values[0];
                    console.log(`Tipo de Solicitud seleccionado: ${selectedTipoSolicitud}`);

                    userPendingData.set(userId, { type: 'caso', paso: 2, tipoSolicitud: selectedTipoSolicitud, interactionId: interaction.id });
                    console.log(`Estado pendiente del usuario ${interaction.user.tag} actualizado (caso, paso 2, tipo ${selectedTipoSolicitud}).`);


                    // --- Responder al Select Menu: Editar el mensaje original y añadir un botón ---
                    try {
                        const completeDetailsButton = new ButtonBuilder()
                            .setCustomId('completeCasoDetailsButton')
                            .setLabel('Completar Detalles del Caso')
                            .setStyle(ButtonStyle.Primary);

                        const buttonActionRow = new ActionRowBuilder().addComponents(completeDetailsButton);

                        await interaction.update({
                            content: `Tipo de Solicitud seleccionado: **${selectedTipoSolicitud}**. Haz clic en el botón para completar los detalles.`,
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
                     console.warn(`Interacción de Select Menu inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                     try {
                         await interaction.update({
                            content: 'Esta selección no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.',
                            components: [],
                            ephemeral: true,
                         });
                     } catch (updateError) {
                         console.error('Error al enviar mensaje de error con update() en Select Menu inesperado:', updateError);
                          try {
                             await interaction.followUp({ content: 'Esta selección no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar. (Error al actualizar mensaje)', ephemeral: true });
                          } catch (fuError) {
                             console.error('Error adicional al intentar followUp después de fallo de update:', fuError);
                          }
                     }
                     userPendingData.delete(userId);
                }
            }
        }

        // --- Manejar Interacciones de Botón ---
        if (interaction.isButton()) {
            if (interaction.customId === 'completeCasoDetailsButton') {
                console.log(`Clic en botón 'completeCasoDetailsButton' recibido por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                const userId = interaction.user.id;
                const pendingData = userPendingData.get(userId);

                if (pendingData && pendingData.type === 'caso' && pendingData.paso === 2 && pendingData.tipoSolicitud) {

                    // !!! MOSTRAR EL MODAL DE REGISTRO DE CASO (Paso 3) !!!
                    try {
                        const modal = buildCasoModal(); // Usamos la función importada
                        await interaction.showModal(modal);
                        console.log('Modal de registro de caso (Paso 3) mostrado al usuario.');

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
                        console.error('Error al mostrar el Modal de registro de caso (Paso 3):', error);
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
                             await interaction.followUp({ content: 'Este botón no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar. (Error al actualizar mensaje)', ephemeral: true });
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
            // Verifica si la sumisión es de nuestro modal de Factura A (usando el customId)
            if (interaction.customId === 'facturaAModal') {
                 console.log(`Submisión del modal 'facturaAModal' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 await interaction.deferReply({ ephemeral: true });

                 // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL DE FACTURA A !!!
                 const pedido = interaction.fields.getTextInputValue('pedidoInput');
                 const caso = interaction.fields.getTextInputValue('casoInput');
                 const email = interaction.fields.getTextInputValue('emailInput');
                 const descripcion = interaction.fields.getTextInputValue('descripcionInput');

                 console.log(`Datos del modal Factura A - Pedido: ${pedido}, Caso: ${caso}, Email: ${email}, Descripción: ${descripcion}`);

                 // --- VERIFICAR DUPLICADO ANTES DE ESCRIBIR ---
                 const sheetRangeToCheckFacA = config.sheetRangeFacA.split('!')[0] + '!A:Z';
                 const spreadsheetIdToCheckFacA = config.spreadsheetIdFacA;
                 const pedidoNumberToCheckFacA = pedido;

                 if (spreadsheetIdToCheckFacA && sheetRangeToCheckFacA) {
                      console.log(`Verificando duplicado para pedido ${pedidoNumberToCheckFacA} en ${spreadsheetIdToCheckFacA}, rango ${sheetRangeToCheckFacA}...`);
                      try {
                           const isDuplicate = await checkIfPedidoExists(sheetsInstance, spreadsheetIdToCheckFacA, sheetRangeToCheckFacA, pedidoNumberToCheckFacA);

                           if (isDuplicate) {
                                console.log(`Pedido ${pedidoNumberToCheckFacA} ya existe. Cancelando registro.`);
                                await interaction.editReply({ content: `❌ El número de pedido **${pedidoNumberToCheckFacA}** ya se encuentra registrado en la hoja de Factura A.`, ephemeral: true });
                                userPendingData.delete(interaction.user.id);
                                return;
                           }
                           console.log(`Pedido ${pedidoNumberToCheckFacA} no encontrado como duplicado. Procediendo a registrar.`);

                      } catch (checkError) {
                           console.error('Error durante la verificación de duplicado (Factura A):', checkError);
                           await interaction.editReply({ content: `⚠️ Hubo un error al verificar si el pedido ya existe. Se intentará registrar de todos modos. Detalles: ${checkError.message}`, ephemeral: true });
                      }
                 } else {
                     console.warn('Configuración incompleta para verificar duplicados (Factura A). Saltando verificación.');
                 }
                 // --- FIN VERIFICACIÓN DUPLICADO ---


                 const fechaHoraActual = new Date();
                 const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                     year: 'numeric', month: '2-digit', day: '2-digit',
                     hour: '2-digit', minute: '2-digit', second: '2-digit',
                     hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                 }).replace(/\//g, '-');


                 const rowData = [
                     pedido,
                     fechaHoraFormateada,
                     `#${caso}`,
                     email,
                     descripcion
                 ];

                 console.log('Datos a escribir en Sheet (Factura A):', rowData);

                 // --- Escribir en Google Sheets (Factura A) y Poner al usuario en estado de espera de archivos ---
                 let sheetSuccess = false;

                 try {
                     if (config.spreadsheetIdFacA && config.sheetRangeFacA) {
                          console.log('Intentando escribir en Google Sheets (Factura A)...');
                          await sheetsInstance.spreadsheets.values.append({
                              spreadsheetId: config.spreadsheetIdFacA,
                              range: config.sheetRangeFacA,
                              valueInputOption: 'RAW',
                              insertDataOption: 'INSERT_ROWS',
                              resource: { values: [rowData] },
                          });
                          console.log('Datos de Sheet (Factura A) agregados correctamente.');
                          sheetSuccess = true;

                          if (config.parentDriveFolderId) {
                               userPendingData.set(interaction.user.id, {
                                    type: 'facturaA',
                                    pedido: pedido,
                                    timestamp: new Date()
                               });
                               console.log(`Usuario ${interaction.user.tag} (ID: ${interaction.user.id}) puesto en estado de espera de adjuntos para pedido ${pedido} (Factura A).`);
                          } else {
                               console.warn('PARENT_DRIVE_FOLDER_ID no configurado. No se pondrá al usuario en estado de espera de adjuntos para Factura A.');
                          }

                     } else {
                          console.warn('Variables de Google Sheets (Factura A) no configuradas. Saltando escritura en Sheet y estado de espera para Factura A.');
                     }

                     let confirmationMessage = '';
                     if (sheetSuccess) {
                         confirmationMessage += '✅ Solicitud de Factura A cargada correctamente en Google Sheets.';
                         if (config.parentDriveFolderId) {
                              confirmationMessage += '\nPor favor, envía los archivos adjuntos para esta solicitud en un **mensaje separado** aquí mismo en este canal.';
                         } else {
                              confirmationMessage += '\n⚠️ La carga de archivos adjuntos a Google Drive no está configurada en el bot para Factura A.';
                         }
                     } else {
                         confirmationMessage += '❌ Solicitud de Factura A no pudo cargarse en Google Sheets (configuración incompleta).';
                         userPendingData.delete(interaction.user.id);
                     }

                     await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                     console.log('Confirmación de solicitud de Factura A enviada.');

                 } catch (error) {
                     console.error('Error general durante el procesamiento de la sumisión del modal (Factura A Sheets):', error);
                     let errorMessage = '❌ Hubo un error al procesar tu solicitud de Factura A.';
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
                     console.log('Mensaje de error de sumisión de modal Factura A enviado.');
                     userPendingData.delete(interaction.user.id);
                 }

            } else if (interaction.customId === 'casoModal') { // Manejador para la sumisión del modal de casos
                 console.log(`Submisión del modal 'casoModal' recibida por ${interaction.user.tag} (ID: ${interaction.user.id}).`);

                 await interaction.deferReply({ ephemeral: true });

                 const userId = interaction.user.id;
                 const pendingData = userPendingData.get(userId);

                 if (pendingData && pendingData.type === 'caso' && pendingData.paso === 2 && pendingData.tipoSolicitud) {

                     // !!! RECUPERAR DATOS DE LOS CAMPOS DEL MODAL DE CASOS !!!
                     const pedido = interaction.fields.getTextInputValue('casoPedidoInput');
                     const numeroCaso = interaction.fields.getTextInputValue('casoNumeroCasoInput');
                     const datosContacto = interaction.fields.getTextInputValue('casoDatosContactoInput');
                     const tipoSolicitud = pendingData.tipoSolicitud;

                     console.log(`Datos del modal Caso - Pedido: ${pedido}, Número Caso: ${numeroCaso}, Tipo Solicitud (guardado): ${tipoSolicitud}, Datos Contacto: ${datosContacto}`);

                     // --- VERIFICAR DUPLICADO ANTES DE ESCRIBIR ---
                     const sheetRangeToCheckCaso = config.sheetRangeCasos.split('!')[0] + '!A:Z';
                     const spreadsheetIdToCheckCaso = config.spreadsheetIdCasos;
                     const pedidoNumberToCheckCaso = pedido;

                     if (spreadsheetIdToCheckCaso && sheetRangeToCheckCaso) {
                          console.log(`Verificando duplicado para pedido ${pedidoNumberToCheckCaso} en ${spreadsheetIdToCheckCaso}, rango ${sheetRangeToCheckCaso}...`);
                          try {
                               const isDuplicate = await checkIfPedidoExists(sheetsInstance, spreadsheetIdToCheckCaso, sheetRangeToCheckCaso, pedidoNumberToCheckCaso);

                               if (isDuplicate) {
                                    console.log(`Pedido ${pedidoNumberToCheckCaso} ya existe. Cancelando registro.`);
                                    await interaction.editReply({ content: `❌ El número de pedido **${pedidoNumberToCheckCaso}** ya se encuentra registrado en la hoja de Casos.`, ephemeral: true });
                                    userPendingData.delete(userId);
                                    return;
                               }
                               console.log(`Pedido ${pedidoNumberToCheckCaso} no encontrado como duplicado. Procediendo a registrar.`);

                          } catch (checkError) {
                               console.error('Error durante la verificación de duplicado (Casos):', checkError);
                               await interaction.editReply({ content: `⚠️ Hubo un error al verificar si el pedido ya existe. Se intentará registrar de todos modos. Detalles: ${checkError.message}`, ephemeral: true });
                          }
                     } else {
                         console.warn('Configuración incompleta para verificar duplicados (Casos). Saltando verificación.');
                     }
                     // --- FIN VERIFICADO DUPLICADO ---


                     const fechaHoraActual = new Date();
                     const fechaHoraFormateada = fechaHoraActual.toLocaleString('es-AR', {
                         year: 'numeric', month: '2-digit', day: '2-digit',
                         hour: '2-digit', minute: '2-digit', second: '2-digit',
                         hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                     }).replace(/\//g, '-');

                     const agenteDiscord = interaction.member ? interaction.member.displayName : interaction.user.username;

                     const rowDataCaso = [
                         pedido,
                         fechaHoraFormateada,
                         agenteDiscord,
                         numeroCaso,
                         tipoSolicitud,
                         datosContacto
                     ];

                     console.log('Datos a escribir en Sheet (Casos):', rowDataCaso);

                     // --- Escribir en Google Sheets (Casos) ---
                     let sheetSuccess = false;
                     try {
                         if (config.spreadsheetIdCasos && config.sheetRangeCasos) {
                             console.log('Intentando escribir en Google Sheets (Casos)...');
                             await sheetsInstance.spreadsheets.values.append({
                                 spreadsheetId: config.spreadsheetIdCasos,
                                 range: config.sheetRangeCasos,
                                 valueInputOption: 'RAW',
                                 insertDataOption: 'INSERT_ROWS',
                                 resource: { values: [rowDataCaso] },
                             });
                             console.log('Datos de Sheet (Casos) agregados correctamente.');
                             sheetSuccess = true;
                         } else {
                             console.warn('Variables de Google Sheets (Casos) no configuradas. Saltando escritura en Sheet para casos.');
                         }

                         let confirmationMessage = '';
                         if (sheetSuccess) {
                             confirmationMessage += '✅ Caso registrado correctamente en Google Sheets.';
                         } else {
                             confirmationMessage += '❌ El caso no pudo registrarse en Google Sheets (configuración incompleta).';
                         }

                         await interaction.editReply({ content: confirmationMessage, ephemeral: true });
                         console.log('Confirmación de registro de caso enviada.');

                     } catch (error) {
                         console.error('Error general durante el procesamiento de la sumisión del modal (Casos Sheets):', error);
                         let errorMessage = '❌ Hubo un error al procesar el registro de tu caso.';
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
                         console.log('Mensaje de error de sumisión de modal Caso enviado.');
                     } finally {
                         userPendingData.delete(userId);
                         console.log(`Estado pendiente del usuario ${interaction.user.tag} limpiado.`);
                     }

                 } else {
                     console.warn(`Sumisión de modal 'casoModal' inesperada de ${interaction.user.tag}. Estado pendiente: ${JSON.stringify(pendingData)}`);
                     try {
                         await interaction.editReply({ content: 'Esta sumisión de formulario no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar.', ephemeral: true });
                     } catch (editError) {
                          console.error('Error al enviar mensaje de error con editReply en sumisión de modal inesperada:', editError);
                          try {
                             await interaction.followUp({ content: 'Esta sumisión de formulario no corresponde a un proceso activo. Por favor, usa el comando /agregar-caso para empezar. (Error)', ephemeral: true });
                          } catch (fuError) {
                             console.error('Error adicional al intentar followUp después de fallo de editReply:', fuError);
                          }
                     }
                     userPendingData.delete(userId);
                 }
            }
        }
    });
};