# LinkedIn Posts Extractor con Apify

Sistema de extracción de posts de LinkedIn usando Apify, integrado con HubSpot para obtener perfiles y crear deals.

## Características

- 🔍 Extracción de posts de LinkedIn usando Apify Actor
- 🔄 Integración con HubSpot (obtener perfiles desde listas y crear deals)
- 💼 Creación de deals en HubSpot para cada post encontrado
- 📊 Rate limiting configurable (máximo de perfiles por día)
- ⏰ Scheduler configurable (ejecución automática periódica)
- 🛡️ Detección de duplicados
- 📝 Logging completo

## Instalación

```bash
# Ir a la carpeta backend
cd backend

# Instalar dependencias
npm install
```

## Configuración

Crea un archivo `.env` en la carpeta `backend` basándote en `.env.example`:

```env
# Apify Configuration
APIFY_API_TOKEN=tu_token_de_apify
APIFY_ACTOR_ID=A3cAPGpwBEG8RJwse
APIFY_BATCH_SIZE=10  # Número de perfiles por lote (recomendado: 10-20)

# HubSpot Configuration
HUBSPOT_TOKEN=tu_token_de_hubspot
HUBSPOT_LIST_ID=5557
# Pipeline y Stage de HubSpot (opcional, si no se configuran se usa el pipeline "Prospección" y su primer stage)
HUBSPOT_PIPELINE_ID=811215668
HUBSPOT_DEAL_STAGE_ID=1194313030

# Server Configuration
PORT=3003
NODE_ENV=development

# Rate Limiting
MAX_PROFILES_PER_DAY=50

# Scheduling Configuration (in minutes)
# How often to run the scraping process
# Examples: 60 = every hour, 1440 = once per day, 30 = every 30 minutes
SCRAPE_INTERVAL_MINUTES=60

# Apify Actor Input Configuration
MAX_POSTS=5
INCLUDE_QUOTE_POSTS=true
INCLUDE_REPOSTS=false
SCRAPE_REACTIONS=false
MAX_REACTIONS=5
SCRAPE_COMMENTS=false
MAX_COMMENTS=5

# Logging
LOG_LEVEL=INFO
```

### Variables de Entorno

#### Apify
- `APIFY_API_TOKEN`: Token de API de Apify (requerido)
- `APIFY_ACTOR_ID`: ID del Actor de Apify (por defecto: `A3cAPGpwBEG8RJwse`)
- `APIFY_BATCH_SIZE`: Número de perfiles por lote para evitar timeouts (por defecto: `10`, recomendado: `10-20`)

#### HubSpot
- `HUBSPOT_TOKEN`: Token de API de HubSpot (requerido)
- `HUBSPOT_LIST_ID`: ID de la lista de HubSpot (por defecto: `5557`)

#### HubSpot (para crear deals)
- `HUBSPOT_PIPELINE_ID`: ID numérico del pipeline (opcional, por defecto: `811215668` - Pipeline "Prospección")
- `HUBSPOT_DEAL_STAGE_ID`: ID numérico del stage (opcional, si no se especifica usa el primer stage del pipeline configurado)
  
  **Ejemplo de configuración:**
  ```env
  HUBSPOT_PIPELINE_ID=811215668
  HUBSPOT_DEAL_STAGE_ID=1194313030  # "Hipótesis OK" - primer stage del pipeline Prospección
  ```

#### Rate Limiting
- `MAX_PROFILES_PER_DAY`: Máximo número de perfiles a procesar por día (por defecto: `50`)

#### Scheduling
- `SCRAPE_INTERVAL_MINUTES`: Intervalo en minutos entre ejecuciones automáticas (por defecto: `60`)
  - `0` o no configurado: Deshabilita el scheduler
  - Ejemplos: `30` = cada 30 minutos, `60` = cada hora, `1440` = una vez al día

#### Apify Actor Input
- `MAX_POSTS`: Máximo número de posts a extraer por perfil (por defecto: `5`)
- `INCLUDE_QUOTE_POSTS`: Incluir quote posts (por defecto: `true`)
- `INCLUDE_REPOSTS`: Incluir reposts (por defecto: `false`)
- `SCRAPE_REACTIONS`: Extraer reacciones (por defecto: `false`)
- `MAX_REACTIONS`: Máximo número de reacciones (por defecto: `5`)
- `SCRAPE_COMMENTS`: Extraer comentarios (por defecto: `false`)
- `MAX_COMMENTS`: Máximo número de comentarios (por defecto: `5`)

## Uso

### Opción 1: Servidor con Scheduler Automático

```bash
# Ir a la carpeta backend
cd backend

# Iniciar servidor (el scheduler se iniciará automáticamente si está configurado)
npm start
```

El servidor iniciará y ejecutará el scraping automáticamente según el intervalo configurado en `SCRAPE_INTERVAL_MINUTES`.

### Opción 2: API REST

```bash
# Ir a la carpeta backend
cd backend

# Iniciar servidor
npm start

# Ejecutar scraping manualmente
curl -X POST http://localhost:3003/api/scraper/run-now

# Obtener estadísticas
curl http://localhost:3003/api/scraper/stats

# Extraer posts de perfiles específicos
curl -X POST http://localhost:3003/api/scraper/extract-posts \
  -H "Content-Type: application/json" \
  -d '{
    "profileLinks": [
      "https://www.linkedin.com/in/satyanadella/",
      "https://www.linkedin.com/in/billgates/"
    ]
  }'

# Extraer posts desde HubSpot
curl -X POST http://localhost:3003/api/scraper/extract-posts \
  -H "Content-Type: application/json" \
  -d '{
    "useHubSpot": true
  }'
```

### Opción 3: Obtener información de un deal específico

```bash
# Ir a la carpeta backend
cd backend

# Obtener información de un deal por su ID
npm run get-deal-info 1234567890

# O directamente con node
node scripts/get-deal-info.js 1234567890
```

Este comando mostrará **ABSOLUTAMENTE TODAS** las propiedades disponibles del deal, organizadas en secciones:

- **🔹 INFORMACIÓN DEL OBJETO**: ID, estado, fechas del objeto
- **⭐ PROPIEDADES PRINCIPALES**: dealname, amount, pipeline, stage, etc.
- **📅 FECHAS IMPORTANTES**: createdate, hs_lastmodifieddate, closedate
- **📊 ESTADOS DEL DEAL**: hs_is_closed, hs_is_closed_won, probabilidad
- **📈 ANALYTICS**: Fuente y datos de analytics
- **🔗 PROPIEDADES DE LINKEDIN**: URLs de posts
- **🔍 TODAS LAS PROPIEDADES DISPONIBLES**: Lista completa alfabética (con contador total)
- **💻 JSON COMPLETO**: Para desarrolladores

**🚀 Características avanzadas:**
- ✅ **Obtención automática de todas las propiedades**: No necesitas especificar qué propiedades consultar
- ✅ **Incluye TODAS las propiedades**: Estándar y personalizadas con valores no vacíos
- ✅ **Optimización de rendimiento**: Evita URLs demasiado largas consultando eficientemente
- ✅ **Muestra el total de propiedades encontradas**
- ✅ **Formateo inteligente**: Fechas, booleanos y valores vacíos se muestran correctamente
- ✅ **Sin límites**: Obtiene todas las propiedades disponibles en tiempo real

## API Endpoints

### GET /health
Health check del servidor.

### POST /api/scraper/extract-posts
Extraer posts de perfiles de LinkedIn.

**Request (con profileLinks):**
```json
{
  "profileLinks": [
    "https://www.linkedin.com/in/profile1",
    "https://www.linkedin.com/in/profile2"
  ]
}
```

**Request (desde HubSpot):**
```json
{
  "useHubSpot": true
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "profileUrl": "https://www.linkedin.com/in/profile1",
      "profileName": "John Doe",
      "postUrl": "https://www.linkedin.com/feed/update/...",
      "success": true,
      "hubspotDealId": "52688453993",
      "duplicate": false
    }
  ],
  "summary": {
    "total": 2,
    "successful": 1,
    "failed": 0,
    "duplicates": 0,
    "profilesProcessed": 2
  },
  "stats": {
    "date": "2024-01-15",
    "count": 2,
    "limit": 50,
    "remaining": 48
  }
}
```

### POST /api/scraper/run-now
Ejecutar scraping manualmente (usa perfiles de HubSpot).

### GET /api/scraper/stats
Obtener estadísticas de rate limit y estado del scheduler.

**Response:**
```json
{
  "success": true,
  "rateLimit": {
    "date": "2024-01-15",
    "count": 10,
    "limit": 50,
    "remaining": 40
  },
  "scheduler": {
    "isRunning": false,
    "isScheduled": true,
    "intervalMinutes": 60
  }
}
```

## Estructura del Proyecto

```
linkedin-posts-apify/
└── backend/
    ├── controllers/
    │   └── scraperController.js
    ├── routes/
    │   └── scraperRoutes.js
    ├── services/
    │   ├── apifyService.js
    │   ├── hubspotService.js (obtener perfiles y crear deals)
    │   ├── loggerService.js
    │   ├── rateLimitService.js
    │   └── schedulerService.js
    ├── scripts/
    │   ├── scrape.js
    │   └── test-structure.js
    ├── data/
    │   ├── logs/
    │   └── rate-limit.json
    ├── .env.example
    ├── package.json
    ├── server.js
    └── README.md
```

## Flujo de Trabajo

1. **Obtener perfiles desde HubSpot**: El sistema obtiene perfiles de LinkedIn desde una lista de HubSpot
2. **Verificar rate limit**: Se verifica si se puede procesar más perfiles hoy
3. **Dividir en lotes**: Los perfiles se dividen en lotes según `APIFY_BATCH_SIZE` (por defecto 10)
4. **Extraer posts con Apify**: Se usa el Actor de Apify para extraer posts de los perfiles (por lotes)
5. **Crear deals en HubSpot**: Para cada post extraído, se crea un deal en HubSpot (si no es duplicado)
6. **Actualizar rate limit**: Se incrementa el contador de perfiles procesados

### ¿Por qué dividir en lotes?

Cuando se procesan muchos perfiles (ej: 100+), hacer una sola llamada a Apify puede causar:
- Timeouts de conexión (`ECONNRESET`)
- Respuestas demasiado grandes
- Fallos en la extracción

Al dividir en lotes de 10-20 perfiles:
- ✅ Conexiones más estables
- ✅ Mejor manejo de errores (si falla un lote, los demás continúan)
- ✅ Progreso visible en tiempo real

## Rate Limiting

El sistema implementa un rate limiting diario para evitar exceder límites de API:

- El contador se resetea cada día a medianoche
- Se puede configurar el máximo de perfiles por día con `MAX_PROFILES_PER_DAY`
- El sistema verifica automáticamente antes de procesar perfiles

## Scheduler

El scheduler ejecuta el proceso de scraping automáticamente según el intervalo configurado:

- Configura `SCRAPE_INTERVAL_MINUTES` para establecer el intervalo
- El scheduler usa `node-cron` para ejecutar tareas programadas
- Si una ejecución está en curso, la siguiente se saltará

## Detección de Duplicados

El sistema verifica duplicados antes de crear deals en HubSpot:

- Busca deals existentes en HubSpot que contengan el URL del post en la descripción
- Compara URLs de posts
- Si encuentra un duplicado, lo marca pero no crea una nueva tarea

## Logging

Los logs se guardan en `data/logs/` con un archivo por día:

- Formato: `YYYY-MM-DD.log`
- Niveles: DEBUG, INFO, WARN, ERROR, SUCCESS, CRITICAL
- Configurable con `LOG_LEVEL`

## Troubleshooting

### Error: "APIFY_API_TOKEN no está configurado"
- Verifica que tengas un archivo `.env` con `APIFY_API_TOKEN` configurado
- Obtén tu token desde https://console.apify.com/account/integrations

### Error: "HUBSPOT_TOKEN no está configurado"
- Verifica que tengas `HUBSPOT_TOKEN` en tu `.env`
- Obtén tu token desde https://app.hubspot.com/settings/integrations/api

### Error: "HUBSPOT_TOKEN no está configurado"
- Verifica que tengas `HUBSPOT_TOKEN` en tu `.env`
- Obtén tu token desde HubSpot Settings → Integrations → Private Apps

### Límite diario alcanzado
- El sistema respeta el límite configurado en `MAX_PROFILES_PER_DAY`
- Espera hasta el siguiente día o aumenta el límite en `.env`

### Scheduler no ejecuta
- Verifica que `SCRAPE_INTERVAL_MINUTES` esté configurado y sea mayor que 0
- Revisa los logs para ver si hay errores

## Tecnologías

- **Node.js**: Runtime de JavaScript
- **Express**: Framework web
- **Apify Client**: Cliente para Apify Actors
- **Axios**: Cliente HTTP
- **node-cron**: Scheduler de tareas
- **dotenv**: Gestión de variables de entorno

## Licencia

ISC

# linkedin-scrapper-posts-apify
# linkedin-scrapper-posts-apify
# linkedin-scrapper-posts-apify
# linkedin-scrapper-posts-apify
# linkedin-posts-scrapper
