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
    const apifyResults = await apifyService.extractPostsFromProfiles(profileUrls);
    loggerService.success(`✓ Apify completado. ${apifyResults.totalItems} posts extraídos de ${apifyResults.profiles.length} perfiles`);

    // Procesar resultados y guardar en HubSpot secuencialmente
    const results = [];
    let processedCount = 0;
    let profilesProcessed = 0;

    for (const profileResult of apifyResults.profiles) {
      const profileInfo = profileMap.get(profileResult.profileUrl);

      // MARCAR CONTACTO COMO SCRAPEADO INMEDIATAMENTE (antes de procesar posts)
      // Esto asegura que se marque incluso si hay errores en el procesamiento
      if (profileInfo?.contactId) {
        loggerService.debug(`Marcando contacto ${profileInfo.contactId} como scrapeado (inicio del procesamiento)`);
        const marked = await hubspotService.markContactAsScraped(profileInfo.contactId);
        if (!marked) {
          loggerService.warn(`⚠️ No se pudo marcar contacto ${profileInfo.contactId} como scrapeado, pero continuando con el procesamiento`);
        }
      } else {
        loggerService.warn(`⚠️ No se encontró contactId para perfil: ${profileResult.profileUrl}`);
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
            profileResult.profileUrl,
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
            profileUrl: profileResult.profileUrl,
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
            profileUrl: profileResult.profileUrl,
            profileName: displayName,
            postUrl: post.url,
            success: false,
            error: error.message
          });
        }
      }

      processedCount += postsSaved;
      profilesProcessed++;

      loggerService.info(`  Resumen perfil: ${postsSaved} guardados, ${postsDuplicated} duplicados, ${postsFailed} fallidos`);
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

    // Si useHubSpot está habilitado, obtener perfiles desde HubSpot
    if (useHubSpot && process.env.HUBSPOT_TOKEN) {
      loggerService.info('Obteniendo perfiles desde HubSpot...');
      try {
        const hubspotProfiles = await hubspotService.getLinkedInProfilesFromHubSpot();
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

    for (const profileResult of apifyResults.profiles) {
      // Obtener información del contacto si useHubSpot está habilitado
      let profileInfo = null;
      if (useHubSpot && hubspotProfiles) {
        // Buscar el perfil correspondiente en los perfiles de HubSpot
        profileInfo = hubspotProfiles.find(p => p.linkedinUrl === profileResult.profileUrl);
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
            profileResult.profileUrl,
            displayName
          );

          results.push({
            profileUrl: profileResult.profileUrl,
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
            profileUrl: profileResult.profileUrl,
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

