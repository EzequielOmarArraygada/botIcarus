import fetch from 'node-fetch';

/**
 * Consulta la API de Andreani para obtener información de tracking.
 * NOTA: Esta función utiliza una API no oficial identificada en el sitio web de Andreani.
 * Para un uso en producción, se recomienda encarecidamente obtener acceso a la API oficial
 * de Andreani para desarrolladores y adaptar esta función según su documentación.
 * @param {string} trackingNumber - Número de seguimiento de Andreani.
 * @param {string} authHeader - Encabezado de autorización (ej: 'Bearer TU_TOKEN').
 * @returns {Promise<object>} - Promesa que resuelve con los datos del tracking.
 * @throws {Error} - Si la consulta falla o la respuesta es inesperada.
 */
export async function getAndreaniTracking(trackingNumber, authHeader) {
    if (!trackingNumber || !authHeader) {
        throw new Error("getAndreaniTracking: Número de tracking o encabezado de autorización incompletos.");
    }

    // Usamos la URL de la API JSON que encontraste
    const andreaniApiUrl = `https://tracking-api.andreani.com/api/v1/Tracking?idReceptor=1&idSistema=1&userData=%7B%22mail%22:%22%22%7D&numeroAndreani=${trackingNumber}`;
    console.log(`Consultando API JSON: ${andreaniApiUrl}`);

    try {
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': authHeader, // <-- Usando el encabezado pasado como parámetro
            'Origin': 'https://www.andreani.com',
            'Referer': 'https://www.andreani.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'es-419,es;q=0.9',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
        };

        const apiResponse = await fetch(andreaniApiUrl, { headers: headers });

        if (!apiResponse.ok) {
            // Si la respuesta HTTP no es 2xx, lanzar un error
            throw new Error(`Error HTTP al consultar la API de Andreani: ${apiResponse.status} ${apiResponse.statusText}`);
        }

        // Parsear la respuesta como JSON
        const trackingData = await apiResponse.json();
        console.log("Respuesta de la API JSON recibida y parseada.");
        // console.log(JSON.stringify(trackingData, null, 2)); // Opcional: log completo del JSON

        // Retornar los datos crudos. La lógica de parseo y formateo se hará en el manejador del comando.
        return trackingData;

    } catch (error) {
        console.error('Error en getAndreaniTracking:', error);
        throw error; // Relanzar el error para que sea manejado por el llamador
    }
}
