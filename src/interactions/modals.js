import { ModalBuilder, TextInputBuilder, ActionRowBuilder } from 'discord.js';

/**
 * Función para construir el objeto Modal de Factura A para registro.
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
export function buildFacturaAModal() {
    const modal = new ModalBuilder()
        .setCustomId('facturaAModal') // ID único para identificar este modal al ser enviado
        .setTitle('Registrar Solicitud Factura A'); // Título que ve el usuario

    // Campo para N° de Pedido
    const pedidoInput = new TextInputBuilder()
        .setCustomId('pedidoInput') // ID único para este campo dentro del modal
        .setLabel("Número de Pedido")
        .setStyle('Short') // Estilo de campo: una línea
        .setRequired(true); // Hacer que este campo sea obligatorio

    // Campo para Caso
    const casoInput = new TextInputBuilder()
        .setCustomId('casoInput') // ID único para este campo
        .setLabel("Número de Caso")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Email
    const emailInput = new TextInputBuilder()
        .setCustomId('emailInput') // ID único para este campo
        .setLabel("Email del Cliente")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Descripción
    const descripcionInput = new TextInputBuilder()
        .setCustomId('descripcionInput') // ID único para este campo
        .setLabel("Detalle de la Solicitud")
        .setStyle('Paragraph') // Estilo de campo: multi-línea
        .setRequired(false); // Puede que no siempre sea necesaria

    // Un Modal puede tener hasta 5 ActionRowBuilder. Cada ActionRowBuilder puede contener 1 TextInputBuilder.
    // Creamos una fila por cada campo de texto.
    const firstRow = new ActionRowBuilder().addComponents(pedidoInput);
    const secondRow = new ActionRowBuilder().addComponents(casoInput);
    const thirdRow = new ActionRowBuilder().addComponents(emailInput);
    const fourthRow = new ActionRowBuilder().addComponents(descripcionInput);

    // Añadir las filas de componentes al modal
    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    return modal;
}

/**
 * Función para construir el objeto Modal de Registro de Caso (Cambios/Devoluciones).
 * Este modal no incluye el campo de Tipo de Solicitud, que se selecciona previamente.
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
export function buildCasoModal() {
    const modal = new ModalBuilder()
        .setCustomId('casoModal') // ID único para identificar este modal al ser enviado
        .setTitle('Detalles del Caso'); // Título que ve el usuario

    // Campo para N° de Pedido (para el caso)
    const casoPedidoInput = new TextInputBuilder()
        .setCustomId('casoPedidoInput') // ID único para este campo
        .setLabel("Número de Pedido")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Número de Caso (para el caso)
    const casoNumeroCasoInput = new TextInputBuilder()
        .setCustomId('casoNumeroCasoInput') // ID único para este campo
        .setLabel("Número de Caso")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Dirección/Telefono/Datos
    const casoDatosContactoInput = new TextInputBuilder()
        .setCustomId('casoDatosContactoInput') // ID único para este campo
        .setLabel("Dirección / Teléfono / Otros Datos")
        .setStyle('Paragraph') // Usar estilo párrafo para más espacio
        .setRequired(true); // Hacer que este campo sea obligatorio

    // Creamos una fila por cada campo de texto.
    const row1 = new ActionRowBuilder().addComponents(casoPedidoInput);
    const row2 = new ActionRowBuilder().addComponents(casoNumeroCasoInput);
    const row3 = new ActionRowBuilder().addComponents(casoDatosContactoInput);

    // Añadir las filas de componentes al modal
    modal.addComponents(row1, row2, row3);

    return modal;
}
