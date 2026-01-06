const apifyService = require('../services/apifyService');
const hubspotService = require('../services/hubspotService');
const rateLimitService = require('../services/rateLimitService');
const loggerService = require('../services/loggerService');

/**
 * Ejecutar scraping programado
 */
const runScheduledScrape = async () => {
  try {
    // Verificar rate limit
    const canProcess = await rateLimitService.canProcessMore();
    if (!canProcess) {
      loggerService.warn('Límite diario alcanzado. No se procesarán más perfiles hoy.');
      return {
        success: false,
        error: 'Daily limit reached',
        stats: await rateLimitService.getStats()
      };
    }

    // Obtener perfiles desde HubSpot
    loggerService.info('Obteniendo perfiles desde HubSpot...');
    const hubspotProfiles = await hubspotService.getLinkedInProfilesFromHubSpot();
    
    if (hubspotProfiles.length === 0) {
      loggerService.warn('No se encontraron perfiles en HubSpot');
      return {
        success: false,
        error: 'No profiles found in HubSpot'
      };
    }

    // Obtener límite restante
    const stats = await rateLimitService.getStats();
    const profilesToProcess = hubspotProfiles.slice(0, stats.remaining);
    
    loggerService.info(`Procesando ${profilesToProcess.length} perfiles (${stats.remaining} restantes del límite diario)`);

    // OPTIMIZACIÓN: Llamar a Apify UNA VEZ con todos los perfiles para ahorrar créditos
    // Apify cobra por ejecución, no por URL, así que es más económico hacer 1 llamada con todas las URLs
    const profileUrls = profilesToProcess.map(p => p.linkedinUrl);
    const profileMap = new Map(profilesToProcess.map(p => [p.linkedinUrl, p]));

    loggerService.info(`\n=== LLAMANDO A APIFY CON ${profileUrls.length} PERFILES (1 EJECUCIÓN = 1 COBRO) ===`);
    loggerService.info(`URLs enviadas a Apify (primeras 5):`);
    profileUrls.slice(0, 5).forEach((url, index) => {
      loggerService.info(`  ${index + 1}. ${url}`);
    });

    const apifyResults = await apifyService.extractPostsFromProfiles(profileUrls);
    loggerService.success(`✓ Apify completado. ${apifyResults.totalItems} posts extraídos de ${apifyResults.profiles.length} perfiles`);

    loggerService.info(`URLs devueltas por Apify (primeras 5):`);
    apifyResults.profiles.slice(0, 5).forEach((profile, index) => {
      loggerService.info(`  ${index + 1}. ${profile.profileUrl}`);
    });

    // MARCAR TODOS LOS PERFILES ENVIADOS A APIFY COMO SCRAPEADOS
    // Si Apify procesó una URL que enviamos, significa que ese perfil fue scrapeado
    loggerService.info(`\n=== MARCANDO PERFILES COMO SCRAPEADOS ===`);
    for (const profileInfo of profilesToProcess) {
      if (profileInfo?.contactId) {
        loggerService.info(`Marcando contacto ${profileInfo.contactId} (${profileInfo.contactName}) como scrapeado`);
        const marked = await hubspotService.markContactAsScraped(profileInfo.contactId);
        if (marked) {
          loggerService.success(`✓ Contacto ${profileInfo.contactId} marcado como scrapeado`);
        } else {
          loggerService.error(`✗ ERROR: No se pudo marcar contacto ${profileInfo.contactId} como scrapeado`);
        }
      }
    }

    // PROCESAR LOS RESULTADOS DE APIFY (posts encontrados)
    const results = [];
    let processedCount = 0;
    let profilesProcessed = 0;

    for (const profileResult of apifyResults.profiles) {
      // Buscar el perfil correspondiente - Apify puede devolver URLs de posts
      let profileInfo = null;

      // Intentar diferentes estrategias para encontrar el perfil
      if (profileResult.profileUrl) {
        // Si es URL de perfil, buscar directamente
        if (profileResult.profileUrl.includes('linkedin.com/in/') ||
            profileResult.profileUrl.includes('linkedin.com/company/') ||
            profileResult.profileUrl.includes('linkedin.com/school/')) {
          profileInfo = profileMap.get(profileResult.profileUrl);
        }

        // Si no encontró, buscar por slug
        if (!profileInfo) {
          const profileSlug = profileResult.profileUrl.split('/').pop();
          for (const [url, info] of profileMap.entries()) {
            const mapSlug = url.split('/').pop();
            if (mapSlug === profileSlug) {
              profileInfo = info;
              break;
            }
          }
        }
      }

      // Si aún no encontró, buscar por nombre
      if (!profileInfo && profileResult.profileName) {
        const resultName = typeof profileResult.profileName === 'string'
          ? profileResult.profileName.toLowerCase()
          : (profileResult.profileName?.name || '').toLowerCase();

        for (const [url, info] of profileMap.entries()) {
          const mapName = (info.contactName || '').toLowerCase();
          if (mapName.includes(resultName) || resultName.includes(mapName)) {
            profileInfo = info;
            break;
          }
        }
      }

      // Si no se encuentra el perfil en nuestro mapa, saltar (puede ser que Apify devolvió resultados para URLs no solicitadas)
      if (!profileInfo) {
        loggerService.warn(`⚠️ No se pudo asociar resultado de Apify con perfil de HubSpot: ${profileResult.profileUrl || profileResult.profileName}`);
        continue;
      }

      // MARCAR CONTACTO COMO SCRAPEADO INMEDIATAMENTE (antes de procesar posts)
      // Esto asegura que se marque incluso si hay errores en el procesamiento
      if (profileInfo?.contactId) {
        loggerService.info(`Marcando contacto ${profileInfo.contactId} (${profileInfo.contactName}) como scrapeado (inicio del procesamiento)`);
        const marked = await hubspotService.markContactAsScraped(profileInfo.contactId);
        if (marked) {
          loggerService.success(`✓ Contacto ${profileInfo.contactId} marcado como scrapeado`);
        } else {
          loggerService.error(`✗ ERROR: No se pudo marcar contacto ${profileInfo.contactId} como scrapeado`);
        }
      }

      // Asegurar que profileName sea un string, no un objeto
      let profileName = null;
      if (profileInfo?.contactName) {
        profileName = typeof profileInfo.contactName === 'string'
          ? profileInfo.contactName
          : (profileInfo.contactName?.name || String(profileInfo.contactName));
      } else if (profileResult.profileName) {
        if (typeof profileResult.profileName === 'string') {
          profileName = profileResult.profileName;
        } else if (typeof profileResult.profileName === 'object' && profileResult.profileName !== null) {
          // Si es un objeto, extraer la propiedad 'name'
          profileName = profileResult.profileName.name || profileResult.profileName.authorName || null;
        } else {
          profileName = String(profileResult.profileName);
        }
      }

      // Si aún no tenemos nombre, usar la URL como fallback
      const displayName = profileName || profileResult.profileUrl || 'Perfil desconocido';

      loggerService.info(`\nProcesando perfil: ${displayName}`);
      loggerService.info(`  Posts encontrados: ${profileResult.posts.length}`);

      // Guardar cada post en HubSpot secuencialmente
      let postsSaved = 0;
      let postsDuplicated = 0;
      let postsFailed = 0;

      for (const post of profileResult.posts) {
        try {
          loggerService.info(`  → Guardando post en HubSpot: ${post.url.substring(0, 50)}...`);
          const hubspotResult = await hubspotService.createDealForPost(
            post,
            profileInfo.linkedinUrl, // Usar la URL original del perfil
            displayName
          );

          if (hubspotResult && !hubspotResult.duplicate) {
            postsSaved++;
            loggerService.success(`  ✓ Post guardado en HubSpot (Deal ID: ${hubspotResult.id})`);
          } else if (hubspotResult && hubspotResult.duplicate) {
            postsDuplicated++;
            loggerService.warn(`  ⏭️  Post duplicado, saltado`);
          }

          results.push({
            profileUrl: profileInfo.linkedinUrl, // Usar la URL original
            profileName: displayName,
            postUrl: post.url,
            success: hubspotResult && !hubspotResult.duplicate,
            hubspotDealId: hubspotResult?.id || null,
            duplicate: hubspotResult?.duplicate || false
          });
        } catch (error) {
          postsFailed++;
          loggerService.error(`  ✗ Error guardando post en HubSpot: ${error.message}`);
          results.push({
            profileUrl: profileInfo.linkedinUrl, // Usar la URL original
            profileName: displayName,
            postUrl: post.url,
            success: false,
            error: error.message
          });
        }
      }

      processedCount += postsSaved;

      loggerService.info(`  Resumen perfil: ${postsSaved} guardados, ${postsDuplicated} duplicados, ${postsFailed} fallidos`);
      profilesProcessed++;
    }

    // Todos los perfiles enviados a Apify fueron marcados como scrapeados
    loggerService.info(`✓ ${profilesToProcess.length} perfiles marcados como scrapeados`);

    // Incrementar contador de rate limit
    await rateLimitService.incrementCount(profilesProcessed);

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duplicates: results.filter(r => r.duplicate).length,
      profilesProcessed: profilesProcessed
    };

    loggerService.info('\n=== RESUMEN ===');
    loggerService.info(`Total posts procesados: ${summary.total}`);
    loggerService.info(`Exitosos: ${summary.successful}`);
    loggerService.info(`Fallidos: ${summary.failed}`);
    loggerService.info(`Duplicados: ${summary.duplicates}`);
    loggerService.info(`Perfiles procesados: ${summary.profilesProcessed}`);

    // Verificar si todos los contactos están scrapeados y resetear solo en ese caso
    loggerService.info('\n=== VERIFICANDO ESTADO DE CONTACTOS ===');
    const allScraped = await hubspotService.areAllContactsScraped();
    if (allScraped) {
      loggerService.info('✓ Todos los contactos están scrapeados. Reiniciando estado...');
      await hubspotService.resetAllContactsScrapedStatus();
    } else {
      loggerService.info('⚠️  Aún hay contactos sin scrapear. No se reseteará el estado.');
    }

    return {
      success: true,
      results,
      summary,
      stats: await rateLimitService.getStats()
    };
  } catch (error) {
    loggerService.error('Error en runScheduledScrape:', error);
    throw error;
  }
};

/**
 * Extraer posts de perfiles (endpoint API)
 */
const extractPosts = async (req, res) => {
  try {
    const { profileLinks, useHubSpot } = req.body;

    let profilesToScrape = [];
    let hubspotProfiles = null; // Para mantener la información completa cuando se usa HubSpot

    // Si useHubSpot está habilitado, obtener perfiles desde HubSpot
    if (useHubSpot && process.env.HUBSPOT_TOKEN) {
      loggerService.info('Obteniendo perfiles desde HubSpot...');
      try {
        hubspotProfiles = await hubspotService.getLinkedInProfilesFromHubSpot();
        profilesToScrape = hubspotProfiles.map(p => p.linkedinUrl);
        loggerService.info(`Perfiles obtenidos desde HubSpot: ${profilesToScrape.length}`);
      } catch (error) {
        loggerService.error('Error obteniendo perfiles desde HubSpot', error);
        return res.status(500).json({
          error: `Error obteniendo perfiles desde HubSpot: ${error.message}`
        });
      }
    } else {
      // Usar profileLinks del request
      if (!profileLinks || !Array.isArray(profileLinks) || profileLinks.length === 0) {
        return res.status(400).json({
          error: 'profileLinks debe ser un array no vacío o useHubSpot debe estar habilitado'
        });
      }
      profilesToScrape = profileLinks;
    }

    // Verificar rate limit
    const canProcess = await rateLimitService.canProcessMore();
    if (!canProcess) {
      const stats = await rateLimitService.getStats();
      return res.status(429).json({ 
        error: 'Daily limit reached',
        stats 
      });
    }

    // Limitar perfiles según rate limit
    const stats = await rateLimitService.getStats();
    const profilesToProcess = profilesToScrape.slice(0, stats.remaining);
    
    if (profilesToProcess.length === 0) {
      return res.status(429).json({ 
        error: 'No remaining profiles for today',
        stats 
      });
    }

    loggerService.info(`Procesando ${profilesToProcess.length} perfiles`);

    // OPTIMIZACIÓN: Llamar a Apify UNA VEZ con todos los perfiles para ahorrar créditos
    // Apify cobra por ejecución, no por URL, así que es más económico hacer 1 llamada con todas las URLs
    loggerService.info(`\n=== LLAMANDO A APIFY CON ${profilesToProcess.length} PERFILES (1 EJECUCIÓN = 1 COBRO) ===`);
    const apifyResults = await apifyService.extractPostsFromProfiles(profilesToProcess);
    loggerService.success(`✓ Apify completado. ${apifyResults.totalItems} posts extraídos de ${apifyResults.profiles.length} perfiles`);

    // Procesar resultados y guardar en HubSpot secuencialmente
    const results = [];
    let profilesProcessed = 0;

    // Crear profileMap si estamos usando HubSpot (similar a runScheduledScrape)
    let profileMap = null;
    if (useHubSpot && hubspotProfiles) {
      profileMap = new Map(hubspotProfiles.map(p => [p.linkedinUrl, p]));
    }

    for (const profileResult of apifyResults.profiles) {
      // Obtener información del contacto si useHubSpot está habilitado
      let profileInfo = null;
      if (useHubSpot && profileMap) {
        profileInfo = profileMap.get(profileResult.profileUrl);
      }

      // MARCAR CONTACTO COMO SCRAPEADO INMEDIATAMENTE (antes de procesar posts)
      if (profileInfo?.contactId) {
        loggerService.debug(`Marcando contacto ${profileInfo.contactId} como scrapeado (API endpoint)`);
        const marked = await hubspotService.markContactAsScraped(profileInfo.contactId);
        if (!marked) {
          loggerService.warn(`⚠️ No se pudo marcar contacto ${profileInfo.contactId} como scrapeado, pero continuando con el procesamiento`);
        }
      }

      // Asegurar que profileName sea un string, no un objeto
      let profileName = null;
      if (profileResult.profileName) {
        if (typeof profileResult.profileName === 'string') {
          profileName = profileResult.profileName;
        } else if (typeof profileResult.profileName === 'object' && profileResult.profileName !== null) {
          // Si es un objeto, extraer la propiedad 'name'
          profileName = profileResult.profileName.name || profileResult.profileName.authorName || null;
        } else {
          profileName = String(profileResult.profileName);
        }
      }

      const displayName = profileName || profileResult.profileUrl || 'Perfil desconocido';

      loggerService.info(`\nProcesando perfil: ${displayName}`);
      loggerService.info(`  Posts encontrados: ${profileResult.posts.length}`);

      // Guardar cada post en HubSpot secuencialmente
      for (const post of profileResult.posts) {
        try {
          loggerService.info(`  → Guardando post en HubSpot: ${post.url.substring(0, 50)}...`);
          const hubspotResult = await hubspotService.createDealForPost(
            post,
            profileInfo.linkedinUrl, // Usar la URL original del perfil
            displayName
          );

          results.push({
            profileUrl: profileInfo.linkedinUrl, // Usar la URL original
            profileName: displayName,
            postUrl: post.url,
            success: hubspotResult && !hubspotResult.duplicate,
            hubspotDealId: hubspotResult?.id || null,
            duplicate: hubspotResult?.duplicate || false
          });

          if (hubspotResult && !hubspotResult.duplicate) {
            loggerService.success(`  ✓ Post guardado en HubSpot (Deal ID: ${hubspotResult.id})`);
          } else if (hubspotResult && hubspotResult.duplicate) {
            loggerService.warn(`  ⏭️  Post duplicado, saltado`);
          }
        } catch (error) {
          loggerService.error(`  ✗ Error guardando post en HubSpot: ${error.message}`);
          results.push({
            profileUrl: profileInfo.linkedinUrl, // Usar la URL original
            profileName: displayName,
            postUrl: post.url,
            success: false,
            error: error.message
          });
        }
      }

      profilesProcessed++;
    }

    // Incrementar contador de rate limit
    await rateLimitService.incrementCount(profilesProcessed);

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duplicates: results.filter(r => r.duplicate).length,
      profilesProcessed: profilesProcessed
    };

    // Verificar si todos los contactos están scrapeados y resetear solo en ese caso
    loggerService.info('\n=== VERIFICANDO ESTADO DE CONTACTOS ===');
    const allScraped = await hubspotService.areAllContactsScraped();
    if (allScraped) {
      loggerService.info('✓ Todos los contactos están scrapeados. Reiniciando estado...');
      await hubspotService.resetAllContactsScrapedStatus();
    } else {
      loggerService.info('⚠️  Aún hay contactos sin scrapear. No se reseteará el estado.');
    }

    res.json({ 
      success: true,
      results,
      summary,
      stats: await rateLimitService.getStats()
    });
  } catch (error) {
    loggerService.error('Error in extractPosts', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
};

module.exports = {
  extractPosts,
  runScheduledScrape
};

