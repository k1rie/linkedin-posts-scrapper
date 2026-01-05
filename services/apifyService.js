const { ApifyClient } = require('apify-client');
const loggerService = require('./loggerService');

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'A3cAPGpwBEG8RJwse';

// Initialize the ApifyClient with API token
let client = null;

const getClient = () => {
  if (!client) {
    if (!APIFY_API_TOKEN) {
      throw new Error('APIFY_API_TOKEN no está configurado en .env');
    }
    client = new ApifyClient({
      token: APIFY_API_TOKEN,
    });
  }
  return client;
};

/**
 * Extrae posts de LinkedIn usando Apify (con división en lotes)
 * @param {string[]} profileUrls - Array de URLs de perfiles de LinkedIn
 * @returns {Promise<Object>} - Resultados de la extracción
 */
const extractPostsFromProfiles = async (profileUrls) => {
  if (!profileUrls || !Array.isArray(profileUrls) || profileUrls.length === 0) {
    throw new Error('profileUrls debe ser un array no vacío');
  }

  try {
    const BATCH_SIZE = parseInt(process.env.APIFY_BATCH_SIZE || '10'); // Dividir en lotes de 10 perfiles
    
    loggerService.info(`\n=== INICIANDO EXTRACCIÓN CON APIFY ===`);
    loggerService.info(`Actor ID: ${APIFY_ACTOR_ID}`);
    loggerService.info(`Perfiles a procesar: ${profileUrls.length}`);
    loggerService.info(`Tamaño de lote: ${BATCH_SIZE} perfiles por llamada`);
    
    const apifyClient = getClient();
    const allResults = [];
    let totalItems = 0;
    let batchNumber = 0;

    // Dividir profileUrls en lotes
    for (let i = 0; i < profileUrls.length; i += BATCH_SIZE) {
      const batch = profileUrls.slice(i, i + BATCH_SIZE);
      batchNumber++;
      
      loggerService.info(`\n--- LOTE ${batchNumber}/${Math.ceil(profileUrls.length / BATCH_SIZE)} (${batch.length} perfiles) ---`);

      // Preparar input del Actor
      const input = {
        targetUrls: batch,
        maxPosts: parseInt(process.env.MAX_POSTS || '5'),
        includeQuotePosts: process.env.INCLUDE_QUOTE_POSTS !== 'false',
        includeReposts: process.env.INCLUDE_REPOSTS === 'true',
        scrapeReactions: process.env.SCRAPE_REACTIONS === 'true',
        maxReactions: parseInt(process.env.MAX_REACTIONS || '5'),
        scrapeComments: process.env.SCRAPE_COMMENTS === 'true',
        maxComments: parseInt(process.env.MAX_COMMENTS || '5')
      };

      loggerService.debug('Input del Actor:', JSON.stringify(input, null, 2));

      // Ejecutar el Actor y esperar a que termine
      loggerService.info(`Ejecutando Actor de Apify (lote ${batchNumber})...`);
      const run = await apifyClient.actor(APIFY_ACTOR_ID).call(input);

      loggerService.info(`Actor ejecutado. Run ID: ${run.id}`);
      loggerService.info(`Estado: ${run.status}`);

      // Obtener resultados del dataset
      loggerService.info('Obteniendo resultados del dataset...');
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      loggerService.success(`Lote ${batchNumber}: ${items.length} posts extraídos`);
      totalItems += items.length;
      
      // Procesar resultados de este lote
      for (const item of items) {
        const profileUrl = item.profileUrl || item.url || item.linkedinUrl;
        
        if (!profileUrl) {
          loggerService.warn('Item sin profileUrl:', item);
          continue;
        }

        // Normalizar URL del perfil
        let normalizedProfileUrl = profileUrl;
        if (!normalizedProfileUrl.includes('linkedin.com/in/')) {
          // Intentar extraer de diferentes formatos
          if (item.authorUrl) {
            normalizedProfileUrl = item.authorUrl;
          }
        }

        // Extraer nombre del autor (puede ser objeto o string)
        let authorName = null;
        if (item.author) {
          if (typeof item.author === 'string') {
            authorName = item.author;
          } else if (typeof item.author === 'object' && item.author !== null) {
            authorName = item.author.name || item.author.authorName || null;
          }
        } else if (item.authorName) {
          authorName = typeof item.authorName === 'string' ? item.authorName : (item.authorName?.name || null);
        }

        // Buscar si ya existe este perfil en allResults
        let existingProfile = allResults.find(r => r.profileUrl === normalizedProfileUrl);
        
        if (!existingProfile) {
          existingProfile = {
            profileUrl: normalizedProfileUrl,
            profileName: authorName,
            posts: []
          };
          allResults.push(existingProfile);
        }

        // Agregar post
        if (item.url || item.postUrl || item.linkedinUrl) {
          existingProfile.posts.push({
            url: item.url || item.postUrl || item.linkedinUrl,
            text: item.text || item.content || item.description || '',
            author: authorName || existingProfile.profileName,
            createdAt: item.createdAt || item.date || item.publishedAt || null,
            reactions: item.reactions || item.likes || null,
            comments: item.comments || null,
            rawData: item
          });
        }
      }

      // Pequeña pausa entre lotes para evitar sobrecarga
      if (i + BATCH_SIZE < profileUrls.length) {
        loggerService.info('Esperando 2 segundos antes del siguiente lote...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    loggerService.info(`\n=== RESUMEN DE EXTRACCIÓN ===`);
    loggerService.info(`Lotes procesados: ${batchNumber}`);
    loggerService.info(`Perfiles procesados: ${allResults.length}`);
    loggerService.info(`Total posts extraídos: ${totalItems}`);
    
    allResults.forEach(result => {
      loggerService.info(`  - ${result.profileName || result.profileUrl}: ${result.posts.length} posts`);
    });

    return {
      success: true,
      totalItems: totalItems,
      profiles: allResults,
      batchesProcessed: batchNumber
    };
  } catch (error) {
    loggerService.error('Error en extracción con Apify:', error);
    throw new Error(`Error en extracción con Apify: ${error.message}`);
  }
};

/**
 * Extrae posts de un solo perfil
 * @param {string} profileUrl - URL del perfil de LinkedIn
 * @returns {Promise<Object>} - Resultados de la extracción
 */
const extractPostsFromProfile = async (profileUrl) => {
  const results = await extractPostsFromProfiles([profileUrl]);
  return results.profiles[0] || null;
};

module.exports = {
  extractPostsFromProfiles,
  extractPostsFromProfile
};

