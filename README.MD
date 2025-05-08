Bot de Discord para Gestión Operativa

Este repositorio contiene el código fuente de un bot personalizado para Discord diseñado para optimizar y automatizar tareas operativas clave, como la gestión de solicitudes de Factura A, el registro de casos y el seguimiento de envíos.
El bot se integra con Google Sheets y Google Drive para la centralización de datos y archivos, y con la API de Andreani para consultas de seguimiento en tiempo real.

Características Principales

Registro de Solicitudes de Factura A:
Comando /factura-a para iniciar el proceso.
Formulario interactivo (Modal) para la captura de datos estructurados.
Registro automático de solicitudes en Google Sheets.
Carga automática de archivos adjuntos (en mensajes posteriores) a Google Drive, organizados por número de pedido.

Registro de Casos (Cambios/Devoluciones):
Comando /agregar-caso con un flujo guiado (Select Menu y Modal).
Captura de Tipo de Solicitud, Número de Pedido, Número de Caso y Datos de Contacto/Dirección.
Registro automático de casos en Google Sheets.

Consulta de Tracking de Envíos:
Comando /tracking para consultar el estado de envíos de Andreani por número de seguimiento.
Consulta en tiempo real a la API de Andreani.
Presentación del estado actual y el historial del envío en Discord.

Búsqueda de Casos:
Comando /buscar-caso para encontrar casos registrados en Google Sheets por Número de Pedido.
Capacidad de buscar en múltiples pestañas (sheets) configuradas.
Presentación de los resultados encontrados directamente en Discord.

Notificación de Errores en Hoja de Casos:
Verificación periódica de una columna de "Errores" en la hoja de Casos.
Envío automático de notificaciones a un canal de Discord designado si se detectan errores sin notificar.
Mención al usuario que cargó el caso con error (si se encuentra en el servidor).


Tecnologías y Herramientas Utilizadas

Lenguaje de Programación: JavaScript (Node.js)
Librería de Discord: discord.js
Integración con Google: googleapis (para Google Sheets y Google Drive)
Integración con Andreani: node-fetch para realizar peticiones HTTP a la API JSON de Andreani.
Gestión de Variables de Entorno: dotenv
Despliegue: Railway
Control de Versiones: Git / GitHub
Configuración del Entorno (.env)
Para el correcto funcionamiento del bot, es necesario configurar las siguientes variables de entorno en un archivo .env en la raíz del proyecto (o directamente en la configuración de entorno del servicio de despliegue como Railway):
DISCORD_TOKEN=TU_DISCORD_BOT_TOKEN
GUILD_ID=ID_DE_TU_SERVIDOR_DISCORD
HELP_CHANNEL_ID=ID_DEL_CANAL_DE_AYUDA

# Canales específicos para comandos
TARGET_CHANNEL_ID_FAC_A=ID_CANAL_FACTURA_A
TARGET_CHANNEL_ID_ENVIOS=ID_CANAL_TRACKING
TARGET_CHANNEL_ID_CASOS=ID_CANAL_CASOS_Y_NOTIFICACIONES
TARGET_CHANNEL_ID_BUSCAR_CASO=ID_CANAL_BUSCAR_CASOS # Opcional, si es un canal diferente

# IDs numéricos de los comandos (se obtienen después del despliegue inicial)
COMMAND_ID_FACTURA_A=ID_COMANDO_FACTURA_A
COMMAND_ID_TRACKING=ID_COMANDO_TRACKING
COMMAND_ID_AGREGAR_CASO=ID_COMANDO_AGREGAR_CASO
COMMAND_ID_BUSCAR_CASO=ID_COMANDO_BUSCAR_CASO

# Configuración de Google Sheets
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", ...}' # JSON de las credenciales de la cuenta de servicio
GOOGLE_SHEET_ID_FAC_A=ID_GOOGLE_SHEET_FACTURA_A
GOOGLE_SHEET_RANGE_FAC_A=NombrePestañaFacturaA!A:E # O A:F si incluiste Descripción
GOOGLE_SHEET_ID_CASOS=ID_GOOGLE_SHEET_CASOS
GOOGLE_SHEET_RANGE_CASOS=NombrePestañaCasos!A:F
GOOGLE_SHEET_RANGE_CASOS_READ=NombrePestañaCasos!A:K # Rango para leer errores y estado de notificación (hasta columna K)
GOOGLE_SHEET_SEARCH_SHEET_ID=ID_GOOGLE_SHEET_BUSQUEDA # ID de la hoja donde buscar (puede ser el mismo que GOOGLE_SHEET_ID_CASOS)
GOOGLE_SHEET_SEARCH_SHEETS=Pestaña1,Pestaña2,Historial # Nombres de las pestañas a buscar, separadas por coma

# Configuración de Google Drive (para adjuntos de Factura A)
PARENT_DRIVE_FOLDER_ID=ID_CARPETA_PADRE_DRIVE # ID de la carpeta donde se crearán las subcarpetas por pedido

# Configuración de Andreani API
ANDREANI_API_AUTH='Bearer TU_TOKEN_DE_AUTORIZACION' # Encabezado de autorización para la API de Andreani

# Configuración de Intervalo de Verificación de Errores (en milisegundos)
ERROR_CHECK_INTERVAL_MS=300000 # Ejemplo: 5 minutos (300000)


Notas sobre las Credenciales de Google:
La variable GOOGLE_CREDENTIALS_JSON debe contener el contenido completo del archivo JSON de la clave de tu cuenta de servicio de Google. Es crucial que esta cuenta de servicio tenga permisos de Editor o superior sobre los Google Sheets y Google Drive que el bot necesita acceder.
Obtener IDs de Comandos:
Después del despliegue inicial, necesitarás obtener los IDs numéricos de los comandos de barra para configurarlos en las variables COMMAND_ID_*. Puedes obtener estos IDs utilizando herramientas de desarrollo de Discord o consultando los logs del bot si los imprime al registrar los comandos.
