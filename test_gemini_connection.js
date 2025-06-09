import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config'; 

const API_KEY = process.env.GEMINI_API_KEY; 
const MODEL_NAME = "gemini-1.5-flash-latest";

async function testGeminiConnection() {
  if (!API_KEY) {
    console.error("ERROR: GEMINI_API_KEY no está definida en tu archivo .env local.");
    console.error("Asegúrate de tener una línea como: GEMINI_API_KEY=TU_CLAVE_AQUI en tu archivo .env");
    return;
  }

  console.log(`Intentando conectar con Gemini con el modelo: ${MODEL_NAME}...`);

  let genAIInstance;
  try {
    genAIInstance = new GoogleGenerativeAI(API_KEY);
    console.log("Instancia de GoogleGenerativeAI creada con éxito.");
  } catch (initError) {
    console.error("ERROR CRÍTICO al inicializar GoogleGenerativeAI:", initError);
    console.error("Esto podría ser un problema con la instalación de la biblioteca o un entorno Node.js incompatible.");
    return;
  }

  try {
    const model = genAIInstance.getGenerativeModel({ model: MODEL_NAME });
    console.log(`Modelo "${MODEL_NAME}" obtenido con éxito.`);

    console.log("Generando contenido de prueba...");
    const result = await model.generateContent("Hola, ¿cómo estás?");
    const response = await result.response;
    const text = response.text();

    console.log("\n--- Respuesta de Gemini (éxito) ---");
    console.log(text);
    console.log("-----------------------------------");
    console.log("¡La conexión con Gemini funciona correctamente!");

  } catch (error) {
    console.error("\n--- ERROR al interactuar con Gemini ---");
    console.error("El modelo no pudo generar contenido o hubo un problema de API.");
    console.error("Detalles del error:", error);
    if (error.status) {
      console.error(`Código de estado HTTP: ${error.status}`);
      console.error(`Mensaje de estado HTTP: ${error.statusText}`);
      if (error.message.includes("404 Not Found")) {
        console.error("¡Es el error 404! Esto significa que el modelo 'gemini-pro' NO está disponible para tu clave de API o en tu región.");
        console.error("Acciones sugeridas:");
        console.error("1. Verifica en Google Cloud Console que la 'Generative Language API' esté habilitada.");
        console.error("2. Asegúrate de que tu clave de API tenga los permisos correctos para usar 'gemini-pro'.");
        console.error("3. Considera si 'gemini-pro' está disponible en la región desde donde estás desplegando (Railway).");
        console.error("4. Si tienes acceso a otros modelos (como 'gemini-pro-1.0-pro' o 'text-bison-001'), intenta cambiarlos en tu código (en 'qaService.js' y aquí) para ver si funcionan.");
      }
    }
    console.log("-----------------------------------");
  }
}

testGeminiConnection();