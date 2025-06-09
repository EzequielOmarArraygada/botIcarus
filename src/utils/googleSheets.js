import { google } from 'googleapis';

let auth;
let sheets;

/**
 * Inicializa las instancias de autenticación y Google Sheets API.
 * Debe ser llamada una vez al iniciar el bot.
 * @param {string} credentialsJson - El contenido JSON de las credenciales de la cuenta de servicio de Google.
 */
export function initializeGoogleSheets(credentialsJson) {
    try {
        const credentials = JSON.parse(credentialsJson);
        auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets', // Permiso para Sheets
                'https://www.googleapis.com/auth/drive'        // Permiso de Drive si se usa la misma cuenta para ambos
            ]
        });
        // Creamos la instancia de sheets usando la autenticación
        sheets = google.sheets({ version: 'v4', auth });
        console.log("Instancia de Google Sheets inicializada.");
        // Retornamos la instancia para que pueda ser usada en otros módulos
        return sheets;
    } catch (error) {
        console.error("Error al inicializar Google Sheets:", error);
        throw error; // Relanzar el error para que se maneje en el punto de inicio (index.js)
    }
}

/**
 * Verifica si un número de pedido ya existe en la columna "Número de pedido" de una hoja específica.
 * Busca la columna por su encabezado.
 * @param {object} sheetsInstance - Instancia de la API de Google Sheets.
 * @param {string} spreadsheetId - ID del Google Sheet.
 * @param {string} sheetRange - Rango de la hoja a leer (ej: 'NombrePestaña!A:Z'). Debe ser amplio para encontrar el encabezado.
 * @param {string} pedidoNumber - El número de pedido a buscar.
 * @returns {Promise<boolean>} - Promesa que resuelve a true si el pedido existe, false si no.
 * @throws {Error} - Lanza un error si falla la lectura de la hoja.
 */
export async function checkIfPedidoExists(sheetsInstance, spreadsheetId, sheetRange, pedidoNumber) {
    if (!sheetsInstance || !spreadsheetId || !sheetRange || !pedidoNumber) {
        console.warn('checkIfPedidoExists: Parámetros incompletos.');
        return false; // Consideramos que no existe si los parámetros son incompletos
    }

    try {
        // Leer todos los datos del rango especificado
        const response = await sheetsInstance.spreadsheets.values.get({ // Usamos sheetsInstance
            spreadsheetId: spreadsheetId,
            range: sheetRange,
        });

        const rows = response.data.values;

        // Si no hay datos o solo encabezados, el pedido no existe
        if (!rows || rows.length <= 1) {
            console.log(`checkIfPedidoExists: No hay datos en ${sheetRange}. Pedido ${pedidoNumber} no encontrado.`);
            return false;
        }

        const headerRow = rows[0]; // La primera fila son los encabezados
        // Buscar el índice de la columna "Número de pedido" (insensible a mayúsculas/minúsculas y espacios)
        const pedidoColumnIndex = headerRow.findIndex(header =>
             header && String(header).trim().toLowerCase() === 'número de pedido'
        );

        if (pedidoColumnIndex === -1) {
            console.warn(`checkIfPedidoExists: No se encontró la columna "Número de pedido" en el rango ${sheetRange}.`);
            // Si no se encuentra la columna, no podemos verificar. Asumimos que no existe para no bloquear el registro.
            return false;
        }

        // Iterar sobre las filas de datos (saltando el encabezado)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];

            // Asegurarse de que la fila tiene la columna del número de pedido antes de acceder a ella
            if (row.length <= pedidoColumnIndex) {
                 continue; // Saltar esta fila si no tiene suficientes columnas
            }

            const rowPedidoValue = row[pedidoColumnIndex] ? String(row[pedidoColumnIndex]).trim() : '';

            // Comparar el valor de la fila con el número de pedido buscado (insensible a mayúsculas/minúsculas y espacios)
            if (rowPedidoValue.toLowerCase() === pedidoNumber.trim().toLowerCase()) {
                console.log(`checkIfPedidoExists: Pedido ${pedidoNumber} encontrado como duplicado en la fila ${i + 1} de ${sheetRange}.`);
                return true; // Se encontró un duplicado
            }
        }

        console.log(`checkIfPedidoExists: Pedido ${pedidoNumber} no encontrado en ${sheetRange}.`);
        return false; // No se encontró el pedido en ninguna fila

    } catch (error) {
        console.error(`checkIfPedidoExists: Error al leer Google Sheet ${spreadsheetId}, rango ${sheetRange}:`, error);
        throw error; // Relanzar el error para que sea manejado por el llamador
    }
}


/**
 * Función para verificar errores en la hoja de Google Sheets de Casos y notificar en Discord.
 * Se ejecuta periódicamente.
 * @param {object} client - Instancia del cliente de Discord (pasada desde index.js).
 * @param {object} sheetsInstance - Instancia de la API de Google Sheets (pasada desde index.js).
 * @param {string} spreadsheetIdCasos - ID del Google Sheet de Casos.
 * @param {string} sheetRangeCasosRead - Rango de lectura de Casos (debe incluir la columna de error y notificación).
 * @param {string} targetChannelIdCasos - ID del canal de notificaciones de casos en Discord.
 * @param {string} guildId - ID del servidor de Discord para buscar miembros.
 */
export async function checkSheetForErrors(client, sheetsInstance, spreadsheetIdCasos, sheetRangeCasosRead, targetChannelIdCasos, guildId) {
    console.log('Iniciando verificación de errores en Google Sheets...');

    // Asegurarse de que las variables necesarias estén configuradas
    if (!sheetsInstance || !spreadsheetIdCasos || !sheetRangeCasosRead || !targetChannelIdCasos || !guildId) {
        console.warn('Configuración incompleta para la verificación de errores. Saltando la verificación.');
        return;
    }

    try {
        // Leer los datos de la hoja de Google Sheets, incluyendo la columna J (ERROR) y K (NOTIFICADO)
        const response = await sheetsInstance.spreadsheets.values.get({ // Usamos sheetsInstance
            spreadsheetId: spreadsheetIdCasos,
            range: sheetRangeCasosRead,
        });

        const rows = response.data.values;

        // Si no hay datos en la hoja (aparte de los encabezados), no hay nada que verificar
        if (!rows || rows.length <= 1) { // Asumimos que la primera fila son encabezados
            console.log('No hay datos de casos en la hoja para verificar.');
            return;
        }

        // Obtener el canal de Discord donde se enviarán las notificaciones
        const casesChannel = await client.channels.fetch(targetChannelIdCasos); // Usamos el cliente pasado
        if (!casesChannel) {
            console.error(`Error: No se pudo encontrar el canal de Discord con ID ${targetChannelIdCasos}.`);
            return;
        }

        // Obtener el servidor (Guild) para buscar miembros por nombre
        const guild = await client.guilds.fetch(guildId); // Usamos el cliente pasado
         if (!guild) {
             console.error(`Error: No se pudo encontrar el servidor de Discord con ID ${guildId}.`);
             return;
         }
         // Cargar todos los miembros del servidor para poder buscarlos por nombre
         await guild.members.fetch();
         console.log(`Miembros del servidor ${guild.name} cargados para búsqueda.`);

        // Extraer el nombre de la hoja del rango configurado (Ej: 'SOLICITUDES BGH 2025!A:K')
        const sheetName = sheetRangeCasosRead.split('!')[0];
        if (!sheetName) {
            console.error(`Error: No se pudo obtener el nombre de la hoja del rango de lectura configurado: ${sheetRangeCasosRead}.`);
            return;
        }


        // Iterar sobre las filas (empezando desde la segunda fila para omitir encabezados)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 1; // Número de fila en Google Sheets (basado en 1)

            // Índices de las columnas: J es 9, K es 10
            const errorColumnIndex = 9; // Columna J
            const notifiedColumnIndex = 10; // Columna K

            // Asegurarse de que la fila tiene suficientes columnas para acceder a la columna J y K
            const errorValue = row.length > errorColumnIndex ? (String(row[errorColumnIndex] || '')).trim() : ''; // Valor en columna J
            const notifiedValue = row.length > notifiedColumnIndex ? (String(row[notifiedColumnIndex] || '')).trim() : ''; // Valor en columna K

            // Si hay contenido en la columna J (ERROR) Y la columna K está vacía (NO Notificado)
            if (errorValue && !notifiedValue) {
                console.log(`Error sin notificar encontrado en la fila ${rowNumber}: "${errorValue}"`);

                // Extraer datos relevantes de la fila (ajusta los índices según tus columnas A-F)
                const pedido = row[0] || 'N/A'; // Col A: N° de pedido (índice 0)
                const fecha = row[1] || 'N/A'; // Col B: Fecha (índice 1)
                const agenteName = row[2] || 'N/A'; // Col C: Agente que cargo la solicitud (índice 2)
                const numeroCaso = row[3] || 'N/A'; // Col D: Numero de caso (índice 3)
                const tipoSolicitud = row[4] || 'N/A'; // Col E: Solicitud (índice 4)
                const datosContacto = row[5] || 'N/A'; // Col F: Dirección/Telefono/Datos (índice 5)
                // Col J: ERROR (índice 9) - ya lo tenemos en errorValue
                // Col K: NOTIFICADO (índice 10) - ya lo tenemos en notifiedValue (sabemos que está vacío)

                // --- Intentar encontrar el usuario de Discord por nombre ---
                let mention = agenteName; // Por defecto, usar el nombre de la hoja si no encontramos al usuario
                try {
                    // Buscar en los miembros del servidor por displayName o username
                    const foundMember = guild.members.cache.find(member =>
                        member.displayName === agenteName || member.user.username === agenteName
                    );

                    if (foundMember) {
                        mention = `<@${foundMember.user.id}>`; // Usar la mención si se encuentra el miembro
                        console.log(`Usuario de Discord encontrado para "${agenteName}": ${foundMember.user.tag}`);
                    } else {
                        console.warn(`No se encontró un usuario de Discord con displayName o username "${agenteName}" en el servidor.`);
                         mention = `**${agenteName}** (Usuario no encontrado)`; // Indicar que no se encontró
                    }
                } catch (findError) {
                    console.error(`Error al buscar usuario de Discord por nombre "${agenteName}":`, findError);
                    mention = `**${agenteName}** (Error al buscar usuario)`; // Indicar error en la búsqueda
                }


                // --- Construir el mensaje de notificación ---
                const notificationMessage = `
🚨 **Error detectado en la hoja de Casos** 🚨

${mention}, hay un error marcado en un caso que cargaste:

**Fila en Sheet:** ${rowNumber}
**N° de Pedido:** ${pedido}
**N° de Caso:** ${numeroCaso}
**Tipo de Solicitud:** ${tipoSolicitud}
**Datos de Contacto:** ${datosContacto}
**Error:** ${errorValue}

Por favor, revisa la hoja para más detalles.
`;

                // --- Enviar el mensaje al canal de casos ---
                try {
                    await casesChannel.send(notificationMessage);
                    console.log(`Notificación de error enviada para la fila ${rowNumber}.`);

                    // --- Marcar la fila como notificada en Google Sheets (Columna K) ---
                    // Obtener la fecha y hora actual para la marca
                     const now = new Date();
                     const notificationTimestamp = now.toLocaleString('es-AR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false, timeZone: 'America/Argentina/Buenos_Aires'
                     }).replace(/\//g, '-');

                    const updateRange = `${sheetName}!K${rowNumber}`; // Rango específico para la celda K de la fila actual
                    const updateValue = [[`Notificado ${notificationTimestamp}`]]; // Valor a escribir (en un array de arrays)

                    console.log(`Marcando fila ${rowNumber} como notificada en rango ${updateRange} con valor: ${updateValue}`);

                    await sheetsInstance.spreadsheets.values.update({ // Usamos sheetsInstance
                        spreadsheetId: spreadsheetIdCasos,
                        range: updateRange,
                        valueInputOption: 'RAW', // Escribir el valor tal cual
                        resource: { values: updateValue },
                    });
                    console.log(`Fila ${rowNumber} marcada como notificada en Google Sheets.`);


                } catch (sendOrUpdateError) {
                    console.error(`Error al enviar el mensaje de notificación o marcar la fila ${rowNumber}:`, sendOrUpdateError);
                    // Si falla el envío o la actualización, no hacemos nada para que se intente de nuevo en la próxima verificación
                }
            }
        }

        console.log('Verificación de errores en Google Sheets completada.');

    } catch (error) {
        console.error('Error al leer la hoja de Google Sheets para verificar errores:', error);
    }
}
