import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;

/**
 * Inicializa la instancia de Gemini.
 * @param {string} ApiKey
 */
function initializeGemini(ApiKey) {
    if (!ApiKey) {
        throw new Error("API Key de Gemini no proporcionada.");
    }
    if (!genAI) {
        genAI = new GoogleGenerativeAI(ApiKey);
    }
}

/**
 * Usa el modelo Gemini para responder una pregunta basada en el texto de un manual.
 * @param {string} manualText - El texto completo del manual.
 * @param {string} question - La pregunta del usuario.
 * @param {string} ApiKey - La clave de API de Gemini.
 * @returns {Promise<string>} - La respuesta generada por la IA.
 */
export async function getAnswerFromManual(manualText, question, apiKey) {
    try {
        initializeGemini(ApiKey);

        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `
            Eres un asistente experto y preciso. Tu única fuente de conocimiento es el siguiente manual de procedimientos.
            Responde la pregunta del usuario basándote EXCLUSIVAMENTE en el contenido de este manual.
            Si la respuesta no se encuentra en el manual, responde "Lo siento, no pude encontrar la respuesta a tu pregunta en el manual."
            No inventes información. Sé directo y cita las partes relevantes del manual si es posible.

            --- INICIO DEL MANUAL ---
            ${manualText}
            --- FIN DEL MANUAL ---

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