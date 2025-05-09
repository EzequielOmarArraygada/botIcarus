import { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';

// --- Opciones para el Select Menu de Tipo de Solicitud ---
export const tipoSolicitudOptions = [
    { label: 'CAMBIO DEFECTUOSO', value: 'CAMBIO DEFECTUOSO' },
    { label: 'CAMBIO INCORRECTO', value: 'CAMBIO INCORRECTO' },
    { label: 'RETIRO ARREPENTIMIENTO', value: 'RETIRO ARREPENTIMIENTO' },
    { label: 'PRODUCTO INCOMPLETO', value: 'PRODUCTO INCOMPLETO' },
    { label: 'OTROS', value: 'OTROS' },
];

/**
 * Función para construir el Select Menu del Tipo de Solicitud de Caso.
 * @returns {ActionRowBuilder} - Un ActionRow conteniendo el Select Menu listo para ser usado en un mensaje.
 */
export function buildTipoSolicitudSelectMenu() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('casoTipoSolicitudSelect') // ID único para identificar este Select Menu
        .setPlaceholder('Selecciona el tipo de solicitud...'); // Texto que se muestra antes de seleccionar

    // Añadir las opciones al Select Menu
    tipoSolicitudOptions.forEach(option => {
        selectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label) // Texto que ve el usuario
                .setValue(option.value) // Valor que se envía al bot
        );
    });

    // El Select Menu debe estar dentro de un ActionRow para ser enviado en un mensaje
    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    return actionRow;
}
