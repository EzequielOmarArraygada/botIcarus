import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;

/**
 * @param {string} geminiApiKey
 */

function initializeGemini(geminiApiKey) {
    if (!geminiApiKey) {
        throw new Error("API Key de Gemini no proporcionada.");
    }
    if (!genAI) {
        genAI = new GoogleGenerativeAI(geminiApiKey);
    }
}

/**
 * @param {string} manualText - El texto completo del manual.
 * @param {string} question - La pregunta del usuario.
 * @param {string} geminiApiKey - La clave de API de Gemini.
 * @returns {Promise<string>} - La respuesta generada por la IA.
 */
export async function getAnswerFromManual(manualText, question, geminiApiKey) {
    try {
        initializeGemini(geminiApiKey);

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

     console.log("--- DEBUG QA SERVICE ---");
        console.log(`Pregunta del usuario: "${question}"`);

        // PARA EL MANUAL

        // const prompt = `
        //    Eres un asistente experto y preciso, especializado en buscar información en el manual de procedimientos proporcionado.
        //    Tu objetivo es encontrar la respuesta a la pregunta del usuario BASÁNDOTE EXCLUSIVAMENTE en el "Contenido del Manual" que se te proporciona.

        //      Directrices para la respuesta:
        //    1.  **Si la respuesta a la pregunta se encuentra de forma clara y explícita en el manual:** Proporciona la respuesta de manera concisa y directa. Intenta citar las frases o secciones relevantes del manual si es posible para mayor precisión.
        //    2.  **Si la respuesta no se encuentra o no se puede inferir directamente del manual:** Responde "Lo siento, no pude encontrar la respuesta a tu pregunta en el manual."
        //    3.  **No inventes información, no uses conocimiento externo ni hagas suposiciones.** Tu única fuente es el manual.
        //    4.  **Si la pregunta es muy general y el manual ofrece múltiples puntos relacionados, sé lo más específico posible con la información que el manual contiene.**

        //    --- Contenido del Manual ---
        //    ${manualText}
        //    --- Fin del Contenido del Manual ---

        //    Pregunta del usuario: "${question}"
        //`;

        const prompt = `
            Eres un argentino experto en literatura y te vana cuestionar sobre la obra "El Martin Fierro".

            Directrices para la respuesta:
            1.  **Si la respuesta a la pregunta se encuentra de forma clara y explícita en el libro:** Proporciona la respuesta de manera concisa y directa. Intenta citar las frases o secciones relevantes del manual si es posible para mayor precisión.
            2.  **Si la respuesta no se encuentra o no se puede inferir directamente del libro:** Responde "Lo siento, no pude encontrar la respuesta a tu pregunta en el manual."
            4.  **Si la pregunta es muy general y el libro ofrece múltiples puntos relacionados, sé lo más específico posible con la información que el manual contiene.**

            --- Contenido del libro ---
            ${manualText}
            --- Fin del Contenido del libro ---

            Pregunta del usuario: "${question}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text;

    } catch (error) {
        console.error("Error al generar respuesta con Gemini:", error);
        throw new Error("Hubo un problema al contactar al servicio de IA.");
    }
}