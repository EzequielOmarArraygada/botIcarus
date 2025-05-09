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
 * Función para construir el objeto Modal de Registro de Caso (Solicitud BGH / Cambio de Dirección).
 * Este modal se usa para tipos de caso que requieren Número de Pedido, Número de Caso y Datos de Contacto.
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
export function buildCasoModal() {
    const modal = new ModalBuilder()
        .setCustomId('casoModal') // ID único para identificar este modal al ser enviado
        .setTitle('Detalles del Caso'); // Título genérico, se puede personalizar en la interacción si se desea

    // Campo para N° de Pedido
    const casoPedidoInput = new TextInputBuilder()
        .setCustomId('casoPedidoInput') // ID único para este campo
        .setLabel("Número de Pedido")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Número de Caso (si aplica)
    const casoNumeroCasoInput = new TextInputBuilder()
        .setCustomId('casoNumeroCasoInput') // ID único para este campo
        .setLabel("Número de Caso (si aplica)") // Label más flexible
        .setStyle('Short')
        .setRequired(false); // Hacerlo opcional si no todos los casos lo tienen

    // Campo para Dirección/Telefono/Datos (o Nueva Dirección para Cambio de Dirección)
    const casoDatosContactoInput = new TextInputBuilder()
        .setCustomId('casoDatosContactoInput') // ID único para este campo
        .setLabel("Datos de Contacto / Nueva Dirección") // Label más flexible
        .setStyle('Paragraph')
        .setRequired(true);

    // Creamos una fila por cada campo de texto.
    const row1 = new ActionRowBuilder().addComponents(casoPedidoInput);
    const row2 = new ActionRowBuilder().addComponents(casoNumeroCasoInput);
    const row3 = new ActionRowBuilder().addComponents(casoDatosContactoInput);

    // Añadir las filas de componentes al modal
    modal.addComponents(row1, row2, row3);

    return modal;
}

/**
 * Función para construir el objeto Modal de Registro de Cancelación.
 * Basado en: Número de pedido - Agente que carga - FECHA - Tipo de SOLICITUD
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
export function buildCancelacionModal() {
    const modal = new ModalBuilder()
        .setCustomId('cancelacionModal') // ID único para este modal (debe coincidir con config.js)
        .setTitle('Detalles de Cancelación');

    // Campo para N° de Pedido
    const cancelacionPedidoInput = new TextInputBuilder()
        .setCustomId('cancelacionPedidoInput') // ID único para este campo
        .setLabel("Número de Pedido")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Motivo de Cancelación (Asumimos que es un campo de texto libre en el modal)
    const motivoCancelacionInput = new TextInputBuilder()
        .setCustomId('motivoCancelacionInput') // ID único para este campo
        .setLabel("Motivo de Cancelación")
        .setStyle('Paragraph')
        .setRequired(true);

    // No necesitamos campos para Agente, FECHA, Tipo de SOLICITUD en el modal,
    // ya que esos datos se generan automáticamente o vienen de la selección del menú.

    // Creamos filas para los campos del modal.
    const row1 = new ActionRowBuilder().addComponents(cancelacionPedidoInput);
    const row2 = new ActionRowBuilder().addComponents(motivoCancelacionInput);

    // Añadir las filas de componentes al modal
    modal.addComponents(row1, row2);

    return modal;
}

/**
 * Función para construir el objeto Modal de Registro de Reembolso.
 * Basado en: Número de pedido - Agente (Front) - Fecha de compra - Motivo de reembolso
 * @returns {ModalBuilder} - El objeto Modal listo para ser mostrado.
 */
export function buildReembolsoModal() {
    const modal = new ModalBuilder()
        .setCustomId('reembolsoModal') // ID único para este modal (debe coincidir con config.js)
        .setTitle('Detalles de Reembolso');

    // Campo para N° de Pedido
    const reembolsoPedidoInput = new TextInputBuilder()
        .setCustomId('reembolsoPedidoInput') // ID único para este campo
        .setLabel("Número de Pedido")
        .setStyle('Short')
        .setRequired(true);

    // Campo para Fecha de compra (el usuario la carga)
    const reembolsoFechaCompraInput = new TextInputBuilder()
        .setCustomId('reembolsoFechaCompraInput') // ID único para este campo
        .setLabel("Fecha de Compra (DD-MM-YYYY)") // Sugerir formato
        .setStyle('Short')
        .setRequired(true);

     // Campo para Motivo de reembolso (el usuario lo carga, aunque en la sheet sea desplegable, aquí es texto libre)
    const reembolsoMotivoInput = new TextInputBuilder()
        .setCustomId('reembolsoMotivoInput') // ID único para este campo
        .setLabel("Motivo de Reembolso")
        .setStyle('Paragraph')
        .setRequired(true);

    // No necesitamos campos para Agente (Front) en el modal, se genera automáticamente.

    // Creamos filas para los campos del modal.
    const row1 = new ActionRowBuilder().addComponents(reembolsoPedidoInput);
    const row2 = new ActionRowBuilder().addComponents(reembolsoFechaCompraInput);
    const row3 = new ActionRowBuilder().addComponents(reembolsoMotivoInput);


    // Añadir las filas de componentes al modal
    modal.addComponents(row1, row2, row3);

    return modal;
}
