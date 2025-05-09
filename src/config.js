import 'dotenv/config';

// Cargar y validar variables de entorno
const config = {
    discordToken: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    helpChannelId: process.env.HELP_CHANNEL_ID,

    targetChannelIdFacA: process.env.TARGET_CHANNEL_ID_FAC_A,
    targetChannelIdEnvios: process.env.TARGET_CHANNEL_ID_ENVIOS,
    targetChannelIdCasos: process.env.TARGET_CHANNEL_ID_CASOS,
    targetChannelIdBuscarCaso: process.env.TARGET_CHANNEL_ID_BUSCAR_CASO,

    andreaniAuthHeader: process.env.ANDREANI_API_AUTH,

    googleCredentialsJson: process.env.GOOGLE_CREDENTIALS_JSON,

    // IDs y rangos de hoja para los diferentes tipos de casos
    // ASEGÚRATE DE AÑADIR ESTAS VARIABLES A TU ARCHIVO .env en Railway
    spreadsheetIdCasosBgh: process.env.GOOGLE_SHEET_ID_CASOS_BGH, // ID para la hoja de Solicitudes BGH 2025
    sheetRangeCasosBgh: process.env.GOOGLE_SHEET_RANGE_CASOS_BGH, // Rango para agregar a Solicitudes BGH 2025 (ej: 'SOLICITUDES BGH 2025!A:F')
    sheetRangeCasosBghRead: process.env.GOOGLE_SHEET_RANGE_CASOS_BGH_READ, // Rango para leer errores de Solicitudes BGH 2025 (ej: 'SOLICITUDES BGH 2025!A:K')

    spreadsheetIdCambioDireccion: process.env.GOOGLE_SHEET_ID_CAMBIO_DIRECCION, // ID para la hoja de Cambio de Dirección 2025
    sheetRangeCambioDireccion: process.env.GOOGLE_SHEET_RANGE_CAMBIO_DIRECCION, // Rango para agregar a Cambio de Dirección 2025 (ej: 'CAMBIO DE DIRECCIÓN 2025!A:F')
    // Si la hoja de Cambio de Dirección tuviera una columna de error, definirías:
    // sheetRangeCambioDireccionRead: process.env.GOOGLE_SHEET_RANGE_CAMBIO_DIRECCION_READ,

    spreadsheetIdCancelaciones: process.env.GOOGLE_SHEET_ID_CANCELACIONES, // ID para la hoja de Cancelaciones 2025
    sheetRangeCancelaciones: process.env.GOOGLE_SHEET_RANGE_CANCELACIONES, // Rango para agregar a Cancelaciones 2025 (ej: 'Cancelaciones 2025!A:D')
    // Si la hoja de Cancelaciones tuviera una columna de error, definirías:
    // sheetRangeCancelacionesRead: process.env.GOOGLE_SHEET_RANGE_CANCELACIONES_READ,

    spreadsheetIdReembolsos: process.env.GOOGLE_SHEET_ID_REEMBOLSOS, // ID para la hoja de REEMBOLSOS
    sheetRangeReembolsos: process.env.GOOGLE_SHEET_RANGE_REEMBOLSOS, // Rango para agregar a REEMBOLSOS (ej: 'REEMBOLSOS!A:D')
     // Si la hoja de Reembolsos tuviera una columna de error, definirías:
    // sheetRangeReembolsosRead: process.env.GOOGLE_SHEET_RANGE_REEMBOLSOS_READ,


    // Configuración para la búsqueda de casos (puede buscar en múltiples hojas/pestañas)
    spreadsheetIdBuscarCaso: process.env.GOOGLE_SHEET_SEARCH_SHEET_ID || process.env.GOOGLE_SHEET_ID_CASOS_BGH, // Usar el de casos BGH como fallback si no se configura uno específico para búsqueda
    sheetsToSearch: process.env.GOOGLE_SHEET_SEARCH_SHEETS ? process.env.GOOGLE_SHEET_SEARCH_SHEETS.split(',').map(s => s.trim()) : [],
    parentDriveFolderId: process.env.PARENT_DRIVE_FOLDER_ID,

    errorCheckIntervalMs: process.env.ERROR_CHECK_INTERVAL_MS ? parseInt(process.env.ERROR_CHECK_INTERVAL_MS) : 300000, // Default: 5 minutos
};

// --- Definición de Tipos de Caso para el comando /agregar-caso ---
// Cada objeto define una opción en el Select Menu y a dónde se dirige la información.
export const caseTypes = [
    {
        label: 'Solicitud BGH', // Texto que se ve en el Select Menu
        value: 'SOLICITUD_BGH', // Valor interno para identificar la opción
        description: 'Registra un caso en la hoja de Solicitudes BGH.', // Descripción en el Select Menu
        sheetId: config.spreadsheetIdCasosBgh, // ID de la hoja de Google Sheets
        sheetRange: config.sheetRangeCasosBgh, // Rango para agregar datos (ej: 'SOLICITUDES BGH 2025!A:F')
        modalId: 'casoModal', // Custom ID del modal a mostrar para este tipo (el que ya tenemos)
        // Información para la verificación de duplicados (opcional por tipo de caso)
        duplicateCheck: {
            sheetId: config.spreadsheetIdCasosBgh, // ID de la hoja donde buscar duplicados
            sheetRange: (config.sheetRangeCasosBgh ? config.sheetRangeCasosBgh.split('!')[0] : 'SOLICITUDES BGH 2025') + '!A:Z', // Rango amplio para buscar encabezado
            columnHeader: 'Número de pedido', // Encabezado de la columna a verificar
        },
        // Definición del orden y campos de los datos a escribir en la hoja
        // Esto es crucial para el manejador del modal submit
        rowDataStructure: [
            { fieldId: 'casoPedidoInput', sheetColumn: 'Número de pedido' },
            { type: 'timestamp', sheetColumn: 'Fecha' }, // Campo generado por el bot
            { type: 'discordUser', sheetColumn: 'Agente que cargo la solicitud' }, // Campo generado por el bot
            { fieldId: 'casoNumeroCasoInput', sheetColumn: 'Numero de caso' },
            { type: 'selectedType', sheetColumn: 'Solicitud' }, // Campo del tipo seleccionado en el menú
            { fieldId: 'casoDatosContactoInput', sheetColumn: 'Dirección/Telefono/Datos' },
            // Puedes añadir más campos si tu modal/hoja los tiene
        ]
    },
    {
        label: 'Cambio de Dirección / Reenvío', // Unificamos estos casos en un solo tipo si usan el mismo modal y hoja
        value: 'CAMBIO_DIRECCION',
        description: 'Registra un caso en la hoja de Cambio de Dirección / Reenvío.',
        sheetId: config.spreadsheetIdCambioDireccion, // Usamos el nuevo ID de hoja
        sheetRange: config.sheetRangeCambioDireccion, // Usamos el nuevo rango
        modalId: 'casoModal', // Usamos el mismo modal que Solicitud BGH si los campos son los mismos
         // Información para la verificación de duplicados (opcional por tipo de caso)
        duplicateCheck: {
            sheetId: config.spreadsheetIdCambioDireccion, // ID de la hoja donde buscar duplicados
            sheetRange: (config.sheetRangeCambioDireccion ? config.sheetRangeCambioDireccion.split('!')[0] : 'CAMBIO DE DIRECCIÓN 2025') + '!A:Z',
            columnHeader: 'Número de pedido', // Asegúrate que este encabezado existe
        },
        // Definición del orden y campos de los datos a escribir en la hoja
        rowDataStructure: [
            { fieldId: 'casoPedidoInput', sheetColumn: 'Número de pedido' },
            { type: 'timestamp', sheetColumn: 'Fecha' },
            { type: 'discordUser', sheetColumn: 'Agente' }, // Ajusta el nombre de la columna si es diferente
            { fieldId: 'casoNumeroCasoInput', sheetColumn: 'Numero de caso' }, // Si aplica
            { type: 'selectedType', sheetColumn: 'Tipo de Solicitud' }, // Campo del tipo seleccionado en el menú (CAMBIO DE DIRECCIÓN, REENVÍO, ACTUALIZAR TRACKING)
            { fieldId: 'casoDatosContactoInput', sheetColumn: 'Nueva Dirección / Datos de Reenvío' }, // Ajusta el label si es diferente
             // Añade aquí otros campos si el modal/hoja de Cambio de Dirección los tiene
        ]
    },
    {
        label: 'Cancelación',
        value: 'CANCELACION',
        description: 'Registra un caso en la hoja de Cancelaciones.',
        sheetId: config.spreadsheetIdCancelaciones, // Usamos el nuevo ID de hoja para Cancelaciones
        sheetRange: config.sheetRangeCancelaciones, // Usamos el nuevo rango para Cancelaciones (ej: 'Cancelaciones 2025!A:D')
        modalId: 'cancelacionModal', // Usamos el nuevo ID de modal para Cancelaciones
         // Información para la verificación de duplicados (opcional por tipo de caso)
        duplicateCheck: {
            sheetId: config.spreadsheetIdCancelaciones, // ID de la hoja donde buscar duplicados
            sheetRange: (config.sheetRangeCancelaciones ? config.sheetRangeCancelaciones.split('!')[0] : 'Cancelaciones 2025') + '!A:Z',
            columnHeader: 'Número de pedido', // Asegúrate que este encabezado existe en la hoja de Cancelaciones
        },
        // Definición del orden y campos de los datos a escribir en la hoja de Cancelaciones
        // Basado en: Número de pedido -Agente que carga - FECHA - Tipo de SOLICITUD
        rowDataStructure: [
            { fieldId: 'cancelacionPedidoInput', sheetColumn: 'Número de pedido' }, // Asumiendo un campo en el modal de cancelación
            { type: 'discordUser', sheetColumn: 'Agente que carga' },
            { type: 'timestamp', sheetColumn: 'FECHA' },
            { type: 'selectedType', sheetColumn: 'Tipo de SOLICITUD' }, // Este será 'Cancelación'
            // Si tu modal de cancelación tiene otros campos, añádelos aquí
            { fieldId: 'motivoCancelacionInput', sheetColumn: 'Motivo de Cancelación' }, // Asumiendo un campo en el modal de cancelación
        ]
    },
     {
        label: 'Reembolso',
        value: 'REEMBOLSO',
        description: 'Registra un caso en la hoja de Reembolsos.',
        sheetId: config.spreadsheetIdReembolsos, // Usamos el nuevo ID de hoja para Reembolsos
        sheetRange: config.sheetRangeReembolsos, // Usamos el nuevo rango para Reembolsos (ej: 'REEMBOLSOS!A:D')
        modalId: 'reembolsoModal', // Usamos un nuevo ID de modal para Reembolsos
         // Información para la verificación de duplicados (opcional por tipo de caso)
        duplicateCheck: {
            sheetId: config.spreadsheetIdReembolsos, // ID de la hoja donde buscar duplicados
            sheetRange: (config.sheetRangeReembolsos ? config.sheetRangeReembolsos.split('!')[0] : 'REEMBOLSOS') + '!A:Z',
            columnHeader: 'Número de pedido', // Asegúrate que este encabezado existe en la hoja de Reembolsos
        },
        // Definición del orden y campos de los datos a escribir en la hoja de Reembolsos
        // Basado en: Número de pedido - Agente (Front) - Fecha de compra - Motivo de reembolso
        rowDataStructure: [
            { fieldId: 'reembolsoPedidoInput', sheetColumn: 'Número de pedido' }, // Asumiendo un campo en el modal de reembolso
            { type: 'discordUser', sheetColumn: 'Agente (Front)' },
            { fieldId: 'reembolsoFechaCompraInput', sheetColumn: 'Fecha de compra' }, // Campo que el usuario carga en el modal
            { fieldId: 'reembolsoMotivoInput', sheetColumn: 'Motivo de reembolso' }, // Campo que el usuario carga en el modal
            // Si tu modal de reembolso tiene otros campos, añádelos aquí
        ]
    },
];


// Validaciones básicas (puedes añadir más según sea necesario)
if (!config.discordToken) {
    console.error("Error CRÍTICO: La variable de entorno DISCORD_TOKEN no está configurada.");
    process.exit(1);
}
if (!config.guildId) {
     console.warn("Advertencia: GUILD_ID no configurado. Algunas funcionalidades (como buscar miembros por nombre para notificaciones) podrían no funcionar correctamente.");
}
if (!config.googleCredentialsJson) {
    console.error("Error CRÍTICO: La variable de entorno GOOGLE_CREDENTIALS_JSON no está configurada.");
    process.exit(1);
}

// Validar que los IDs y rangos de hoja estén configurados para los tipos de caso definidos
caseTypes.forEach(caseType => {
    if (!caseType.sheetId) {
        console.error(`Error CRÍTICO: GOOGLE_SHEET_ID no configurado para el tipo de caso "${caseType.label}" (value: ${caseType.value}).`);
        // process.exit(1); // Podrías salir aquí si es un error fatal
    }
    if (!caseType.sheetRange) {
        console.error(`Error CRÍTICO: GOOGLE_SHEET_RANGE no configurado para el tipo de caso "${caseType.label}" (value: ${caseType.value}).`);
        // process.exit(1); // Podrías salir aquí
    }
     // Validar configuración de duplicateCheck si existe
    if (caseType.duplicateCheck) {
        if (!caseType.duplicateCheck.sheetId) console.warn(`Advertencia: duplicateCheck.sheetId no configurado para el tipo de caso "${caseType.label}". La verificación podría no funcionar.`);
        if (!caseType.duplicateCheck.sheetRange) console.warn(`Advertencia: duplicateCheck.sheetRange no configurado para el tipo de caso "${caseType.label}". La verificación podría no funcionar.`);
        if (!caseType.duplicateCheck.columnHeader) console.warn(`Advertencia: duplicateCheck.columnHeader no configurado para el tipo de caso "${caseType.label}". La verificación podría no funcionar.`);
    }
    // Validar rowDataStructure
    if (!caseType.rowDataStructure || caseType.rowDataStructure.length === 0) {
         console.error(`Error CRÍTICO: rowDataStructure no definido o vacío para el tipo de caso "${caseType.label}" (value: ${caseType.value}).`);
         // process.exit(1); // Podrías salir aquí
    }
});


// Validar intervalo de verificación de errores
if (isNaN(config.errorCheckIntervalMs) || config.errorCheckIntervalMs < 10000) { // Mínimo 10 segundos
    console.warn(`ERROR_CHECK_INTERVAL_MS configurado incorrectamente o muy bajo (${process.env.ERROR_CHECK_INTERVAL_MS}). Usando valor por defecto: ${config.errorCheckIntervalMs} ms.`);
    config.errorCheckIntervalMs = 300000; // Reset a 5 minutos si es inválido
}


// Exportar el objeto de configuración y los tipos de caso
export default config;
