import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI;

/**
 * Inicializa la instancia de Gemini.
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
 * Usa el modelo Gemini para responder una pregunta basada en el texto de un manual.
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
        console.log(`Longitud del manual recibido: ${manualText ? manualText.length : 'null/undefined'}`);
        if (manualText && manualText.length > 0) {
            console.log(`Primeros 200 caracteres del manual:\n${manualText.substring(0, 200)}...`);
        } else {
            console.warn("ADVERTENCIA: manualText está vacío o es nulo. La IA no podrá responder.");
        }
        console.log("------------------------");
        // ------------------------------------

        const prompt = `
            Eres un asistente experto y preciso, especializado en buscar información en el manual de procedimientos proporcionado.
            Tu objetivo es encontrar la respuesta a la pregunta del usuario BASÁNDOTE EXCLUSIVAMENTE en el "Contenido del Manual" que se te proporciona.

            Directrices para la respuesta:
            1.  **Si la respuesta a la pregunta se encuentra de forma clara y explícita en el manual:** Proporciona la respuesta de manera concisa y directa. Intenta citar las frases o secciones relevantes del manual si es posible para mayor precisión.
            2.  **Si la respuesta no se encuentra o no se puede inferir directamente del manual:** Responde "Lo siento, no pude encontrar la respuesta a tu pregunta en el manual."
            3.  **No inventes información, no uses conocimiento externo ni hagas suposiciones.** Tu única fuente es el manual.
            4.  **Si la pregunta es muy general y el manual ofrece múltiples puntos relacionados, sé lo más específico posible con la información que el manual contiene.**

            --- Contenido del Manual ---
            ${manualText}
            --- Fin del Contenido del Manual ---

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