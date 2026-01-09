const axios = require('axios');
const loggerService = require('./loggerService');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_LIST_ID = process.env.HUBSPOT_LIST_ID || '5557';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

/**
 * Verificar si todos los contactos están scrapeados
 */
const areAllContactsScraped = async () => {
  if (!HUBSPOT_TOKEN) {
    return false;
  }

  try {
    // Obtener todos los contactos de la lista
    let contacts = [];
    let after = null;
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 150;

    while (hasMore && attempts < maxAttempts) {
      attempts++;
      
      const params = new URLSearchParams();
      params.append('count', '100');
      params.append('property', 'scrapeado_linkedin');
      if (after) {
        params.append('vidOffset', after);
      }

      try {
        const url = `https://api.hubapi.com/contacts/v1/lists/${HUBSPOT_LIST_ID}/contacts/all?${params.toString()}`;
        
        const contactsResponse = await axios.get(
          url,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const batchContacts = contactsResponse.data.contacts || [];
        contacts = contacts.concat(batchContacts);

        hasMore = contactsResponse.data['has-more'] === true;
        if (hasMore) {
          after = contactsResponse.data['vid-offset'];
        }
      } catch (error) {
        loggerService.error(`Error obteniendo contactos para verificar:`, error.message);
        hasMore = false;
      }
    }

    if (contacts.length === 0) {
      return false; // No hay contactos, no se puede considerar que todos están scrapeados
    }

    // Verificar que TODOS los contactos estén marcados como scrapeados
    let allScraped = true;
    let scrapedCount = 0;
    let notScrapedCount = 0;

    for (const contact of contacts) {
      const properties = contact.properties || {};
      const scrapedStatus = properties.scrapeado_linkedin?.value || properties.scrapeado_linkedin;
      
      // Considerar scrapeado si es 'true' o true
      if (scrapedStatus === 'true' || scrapedStatus === true) {
        scrapedCount++;
      } else {
        notScrapedCount++;
        allScraped = false;
      }
    }

    loggerService.info(`Verificación de scraping: ${scrapedCount} scrapeados, ${notScrapedCount} no scrapeados de ${contacts.length} total`);
    
    return allScraped;
  } catch (error) {
    loggerService.error('Error verificando estado de contactos:', error);
    return false;
  }
};

/**
 * Resetear todos los contactos de una lista como no scrapeados
 */
const resetAllContactsScrapedStatus = async () => {
  if (!HUBSPOT_TOKEN) {
    return false;
  }

  try {
    loggerService.info('\n=== RESETEANDO ESTADO DE SCRAPING DE CONTACTOS ===');
    
    // Obtener todos los contactos de la lista
    let contacts = [];
    let after = null;
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 150;

    while (hasMore && attempts < maxAttempts) {
      attempts++;
      
      const params = new URLSearchParams();
      params.append('count', '100');
      params.append('property', 'scrapeado_linkedin');
      if (after) {
        params.append('vidOffset', after);
      }

      try {
        const url = `https://api.hubapi.com/contacts/v1/lists/${HUBSPOT_LIST_ID}/contacts/all?${params.toString()}`;
        
        const contactsResponse = await axios.get(
          url,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const batchContacts = contactsResponse.data.contacts || [];
        contacts = contacts.concat(batchContacts);

        hasMore = contactsResponse.data['has-more'] === true;
        if (hasMore) {
          after = contactsResponse.data['vid-offset'];
        }
      } catch (error) {
        loggerService.error(`Error obteniendo contactos para resetear:`, error.message);
        hasMore = false;
      }
    }

    loggerService.info(`Total de contactos a resetear: ${contacts.length}`);

    // Resetear cada contacto en lotes
    let resetCount = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      
      const resetPromises = batch.map(contact => 
        axios.patch(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contact.vid}`,
          {
            properties: {
              scrapeado_linkedin: 'false'
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        ).catch(error => {
          loggerService.warn(`Error reseteando contacto ${contact.vid}:`, error.message);
          return null;
        })
      );

      const results = await Promise.all(resetPromises);
      resetCount += results.filter(r => r !== null).length;

      loggerService.debug(`Reseteados ${resetCount}/${contacts.length} contactos...`);

      // Pequeña pausa entre lotes
      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    loggerService.success(`✓ ${resetCount} contactos reseteados como no scrapeados`);
    return true;
  } catch (error) {
    loggerService.error('Error reseteando estado de contactos:', error);
    return false;
  }
};

/**
 * Obtiene todos los perfiles de LinkedIn desde HubSpot
 */
const getLinkedInProfilesFromHubSpot = async () => {
  if (!HUBSPOT_TOKEN) {
    throw new Error('HUBSPOT_TOKEN no está configurado en .env');
  }

  try {
    loggerService.info(`\n=== OBTENIENDO PERFILES DESDE HUBSPOT ===`);
    loggerService.info(`List ID: ${HUBSPOT_LIST_ID}`);
    loggerService.info(`Token: ${HUBSPOT_TOKEN.substring(0, 10)}...`);
    
    let contacts = [];
    let after = null;
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 150; // Para manejar hasta 15k contactos (100 por página)

    while (hasMore && attempts < maxAttempts) {
      attempts++;
      
      const properties = ['linkedin', 'hs_linkedin_url', 'linkedin_profile_link', 'firstname', 'lastname', 'name', 'scrapeado_linkedin'];
      
      const params = new URLSearchParams();
      params.append('count', '100');
      properties.forEach(prop => {
        params.append('property', prop);
      });
      if (after) {
        params.append('vidOffset', after);
      }

      try {
        loggerService.debug(`Obteniendo página ${attempts}...`);
        const url = `https://api.hubapi.com/contacts/v1/lists/${HUBSPOT_LIST_ID}/contacts/all?${params.toString()}`;
        
        const contactsResponse = await axios.get(
          url,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const batchContacts = contactsResponse.data.contacts || [];
        loggerService.debug(`Contactos en esta página: ${batchContacts.length}`);
        
        contacts = contacts.concat(batchContacts);

        hasMore = contactsResponse.data['has-more'] === true;
        if (hasMore) {
          after = contactsResponse.data['vid-offset'];
        }
      } catch (error) {
        loggerService.error(`Error en página ${attempts}:`, error.message);
        
        if (error.response) {
          if (error.response.status === 404) {
            throw new Error(`Lista ${HUBSPOT_LIST_ID} no encontrada. Verifica el List ID en .env`);
          }
          if (error.response.status === 401) {
            throw new Error(`Token de HubSpot inválido o expirado`);
          }
        }
        
        hasMore = false;
      }
    }

    loggerService.info(`Total de contactos obtenidos: ${contacts.length}`);
    loggerService.info(`Filtrando contactos no scrapeados...`);
    
    // Filtrar contactos que NO estén marcados como scrapeados
    let unscrapedContacts = contacts.filter(contact => {
      const properties = contact.properties || {};
      const scrapedStatus = properties.scrapeado_linkedin?.value || properties.scrapeado_linkedin;
      // Incluir si es 'false', null, undefined, o vacío
      return !scrapedStatus || scrapedStatus === 'false' || scrapedStatus === false;
    });
    
    loggerService.info(`Contactos no scrapeados: ${unscrapedContacts.length} de ${contacts.length}`);
    
    // Si no hay contactos no scrapeados, verificar si TODOS están scrapeados antes de resetear
    if (unscrapedContacts.length === 0 && contacts.length > 0) {
      loggerService.info(`\n⚠️  No se encontraron contactos no scrapeados. Verificando si TODOS están scrapeados...`);
      const allScraped = await areAllContactsScraped();
      
      if (allScraped) {
        loggerService.info(`✓ Todos los contactos están scrapeados. Reiniciando estado...`);
        await resetAllContactsScrapedStatus();
        loggerService.info(`✓ Estado reiniciado. Volviendo a obtener contactos...`);
        
        // Volver a obtener los contactos después del reset
        contacts = [];
        after = null;
        hasMore = true;
        attempts = 0;
        
        while (hasMore && attempts < maxAttempts) {
          attempts++;
          
          const properties = ['linkedin', 'hs_linkedin_url', 'linkedin_profile_link', 'firstname', 'lastname', 'name', 'scrapeado_linkedin'];
          
          const params = new URLSearchParams();
          params.append('count', '100');
          properties.forEach(prop => {
            params.append('property', prop);
          });
          if (after) {
            params.append('vidOffset', after);
          }

          try {
            loggerService.debug(`Obteniendo página ${attempts} (después del reset)...`);
            const url = `https://api.hubapi.com/contacts/v1/lists/${HUBSPOT_LIST_ID}/contacts/all?${params.toString()}`;
            
            const contactsResponse = await axios.get(
              url,
              {
                headers: {
                  'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            const batchContacts = contactsResponse.data.contacts || [];
            loggerService.debug(`Contactos en esta página: ${batchContacts.length}`);
            
            contacts = contacts.concat(batchContacts);

            hasMore = contactsResponse.data['has-more'] === true;
            if (hasMore) {
              after = contactsResponse.data['vid-offset'];
            }
          } catch (error) {
            loggerService.error(`Error en página ${attempts}:`, error.message);
            
            if (error.response) {
              if (error.response.status === 404) {
                throw new Error(`Lista ${HUBSPOT_LIST_ID} no encontrada. Verifica el List ID en .env`);
              }
              if (error.response.status === 401) {
                throw new Error(`Token de HubSpot inválido o expirado`);
              }
            }
            
            hasMore = false;
          }
        }
        
        // Filtrar nuevamente los contactos después del reset
        unscrapedContacts = contacts.filter(contact => {
          const properties = contact.properties || {};
          const scrapedStatus = properties.scrapeado_linkedin?.value || properties.scrapeado_linkedin;
          return !scrapedStatus || scrapedStatus === 'false' || scrapedStatus === false;
        });
        
        loggerService.info(`Contactos obtenidos después del reset: ${unscrapedContacts.length} de ${contacts.length}`);
      } else {
        loggerService.warn(`⚠️  Algunos contactos aún no están scrapeados. No se reseteará el estado.`);
      }
    }
    loggerService.info(`Procesando contactos para extraer URLs de LinkedIn...`);
    
    const profiles = [];
    let contactsWithLinkedIn = 0;
    let contactsWithoutLinkedIn = 0;
    let contactsAlreadyScraped = 0;

    for (let i = 0; i < unscrapedContacts.length; i++) {
      const contact = unscrapedContacts[i];
      const properties = contact.properties || {};
      
      // Verificar nuevamente el estado de scraping (por seguridad)
      const scrapedStatus = properties.scrapeado_linkedin?.value || properties.scrapeado_linkedin;
      if (scrapedStatus && scrapedStatus !== 'false' && scrapedStatus !== false) {
        contactsAlreadyScraped++;
        continue;
      }
      
      let linkedinUrl = null;
      
      if (properties.linkedin) {
        linkedinUrl = properties.linkedin.value || properties.linkedin;
      } else if (properties.hs_linkedin_url) {
        linkedinUrl = properties.hs_linkedin_url.value || properties.hs_linkedin_url;
      } else if (properties.linkedin_profile_link) {
        linkedinUrl = properties.linkedin_profile_link.value || properties.linkedin_profile_link;
      }
      
      if (linkedinUrl && typeof linkedinUrl === 'object') {
        linkedinUrl = linkedinUrl.value || linkedinUrl;
      }
      
      if (linkedinUrl && typeof linkedinUrl === 'string' && linkedinUrl.includes('linkedin.com')) {
        contactsWithLinkedIn++;
        let profileUrl = linkedinUrl.trim();

        if (!profileUrl.startsWith('http')) {
          profileUrl = `https://${profileUrl}`;
        }

        // Normalizar URL: remover parámetros de query y fragmentos
        profileUrl = profileUrl.split('?')[0].split('#')[0];

        // Solo incluir URLs que parezcan perfiles válidos
        // linkedin.com/in/ (perfiles personales)
        // linkedin.com/company/ (páginas de empresa)
        // linkedin.com/school/ (escuelas)
        if (profileUrl.includes('linkedin.com/in/') ||
            profileUrl.includes('linkedin.com/company/') ||
            profileUrl.includes('linkedin.com/school/')) {

          profiles.push({
            contactId: contact.vid,
            contactName: properties.firstname?.value ||
                        properties.name?.value ||
                        `${properties.firstname?.value || ''} ${properties.lastname?.value || ''}`.trim() ||
                        'Unknown',
            linkedinUrl: profileUrl
          });
        }
      } else {
        contactsWithoutLinkedIn++;
      }
    }
    
    loggerService.info(`Resumen:`);
    loggerService.info(`- Total contactos obtenidos: ${contacts.length}`);
    loggerService.info(`- Contactos no scrapeados: ${unscrapedContacts.length}`);
    loggerService.info(`- Contactos ya scrapeados (filtrados): ${contactsAlreadyScraped}`);
    loggerService.info(`- Contactos con LinkedIn: ${contactsWithLinkedIn}`);
    loggerService.info(`- Contactos sin LinkedIn: ${contactsWithoutLinkedIn}`);
    loggerService.info(`- Perfiles válidos encontrados: ${profiles.length}`);
    
    if (profiles.length === 0 && contacts.length > 0) {
      loggerService.warn('⚠️  ADVERTENCIA: Se encontraron contactos pero ninguno tiene URL de LinkedIn válida');
    }
    
    return profiles;
  } catch (error) {
    loggerService.error('Error obteniendo perfiles de HubSpot:', error);
    throw new Error(`Error obteniendo perfiles de HubSpot: ${error.message}`);
  }
};

/**
 * Obtener pipelines y stages disponibles de HubSpot
 */
const getPipelinesAndStages = async () => {
  if (!HUBSPOT_TOKEN) {
    return null;
  }

  try {
    const response = await axios.get(
      `${HUBSPOT_BASE_URL}/crm/v3/pipelines/deals`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.results || [];
  } catch (error) {
    loggerService.warn('Error obteniendo pipelines de HubSpot:', error.message);
    return null;
  }
};

/**
 * Obtener el stage ID válido para un pipeline
 */
const getValidStageId = async (pipelineId = null) => {
  const pipelines = await getPipelinesAndStages();
  
  if (!pipelines || pipelines.length === 0) {
    loggerService.warn('No se pudieron obtener pipelines, usando stage por defecto');
    return null;
  }

  // Si se especifica un pipeline ID, buscar ese pipeline
  let targetPipeline = null;
  if (pipelineId) {
    targetPipeline = pipelines.find(p => p.id === pipelineId);
  }
  
  // Si no se encontró o no se especificó, usar el primer pipeline
  if (!targetPipeline) {
    targetPipeline = pipelines[0];
  }

  // Obtener el primer stage del pipeline
  if (targetPipeline.stages && targetPipeline.stages.length > 0) {
    const firstStage = targetPipeline.stages[0];
    loggerService.debug(`Usando pipeline: ${targetPipeline.id} (${targetPipeline.label}), stage: ${firstStage.id} (${firstStage.label})`);
    return {
      pipelineId: targetPipeline.id,
      stageId: firstStage.id
    };
  }

  return null;
};

/**
 * Verificar si un post ya existe como deal en HubSpot
 */
const checkDuplicateDeal = async (postLink) => {
  if (!HUBSPOT_TOKEN) {
    return false;
  }

  try {
    // Buscar deals que contengan el link del post en la descripción
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'description',
                operator: 'CONTAINS_TOKEN',
                value: postLink
              }
            ]
          }
        ],
        limit: 10,
        properties: ['id', 'dealname', 'description']
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = response.data.results || [];
    
    // Verificar si alguno contiene el link exacto
    for (const deal of deals) {
      const description = deal.properties?.description || '';
      if (description.includes(postLink)) {
        loggerService.debug(`Deal duplicado encontrado: ${deal.id}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    // Si hay error (propiedad no existe, etc.), continuar de todas formas
    loggerService.debug('Error verificando duplicados en HubSpot, continuando...', error.message);
    return false;
  }
};

/**
 * Crear un deal en HubSpot para un post de LinkedIn
 */
const createDealForPost = async (postData, profileUrl, profileName = null) => {
  if (!HUBSPOT_TOKEN) {
    loggerService.warn('HUBSPOT_TOKEN no está configurado, saltando guardado en HubSpot');
    return null;
  }

  if (!postData || !postData.url) {
    loggerService.warn('No hay datos de post para guardar');
    return null;
  }

  const postLink = postData.url;

  try {
    // Verificar duplicados
    loggerService.debug(`Verificando duplicados para: ${postLink}`);
    const isDuplicate = await checkDuplicateDeal(postLink);
    
    if (isDuplicate) {
      loggerService.warn(`Post duplicado encontrado, saltando: ${postLink}`);
      return { duplicate: true, id: null };
    }

    // Extraer información del autor/perfil
    let authorName = profileName || 'No disponible';
    
    // Si profileName es un objeto, extraer el nombre
    if (typeof authorName === 'object' && authorName !== null) {
      authorName = authorName.name || authorName.contactName || authorName.author || authorName.authorName || 'No disponible';
    }
    
    // Si no hay profileName, intentar obtenerlo del postData.author
    if (!authorName || authorName === 'No disponible') {
      if (postData.author) {
        if (typeof postData.author === 'string') {
          authorName = postData.author;
        } else if (typeof postData.author === 'object' && postData.author !== null) {
          authorName = postData.author.name || postData.author.authorName || 'No disponible';
        }
      }
    }

    // Construir descripción con información del post
    let description = `Post de LinkedIn\n\n`;
    description += `Autor/Perfil: ${authorName}\n`;
    description += `URL del perfil: ${profileUrl || 'No disponible'}\n`;
    description += `URL del post: ${postLink}\n\n`;
    
    if (postData.text) {
      description += `Contenido:\n${postData.text.substring(0, 1000)}${postData.text.length > 1000 ? '...' : ''}\n\n`;
    }
    
    if (postData.createdAt) {
      description += `Fecha del post: ${postData.createdAt}\n`;
    }

    // Preparar propiedades del deal (solo propiedades estándar de HubSpot)
    const dealProperties = {
      dealname: `Post: ${authorName} - Post LinkedIn`,
      description: description,
      amount: '0', // Sin monto inicial
      deal_currency_code: 'MXN',
      link_original_de_la_noticia: profileUrl // Guardar el link del perfil de LinkedIn
    };

    // Log de datos que se van a guardar
    loggerService.info('=== GUARDANDO DEAL EN HUBSPOT ===');
    loggerService.info(`Programa: Post`);
    loggerService.info(`Deal Name: ${dealProperties.dealname}`);
    loggerService.info(`Author: ${authorName}`);
    loggerService.info(`Post URL: ${postLink}`);
    loggerService.info(`Profile URL (guardado): ${profileUrl || 'No disponible'}`);
    loggerService.info('================================');

    // Obtener pipeline y stage desde .env o usar valores por defecto
    const envPipelineId = process.env.HUBSPOT_PIPELINE_ID || '654720623'; // Default: proyectos
    const envStageId = process.env.HUBSPOT_DEAL_STAGE_ID || '1169433784'; // Default: stage para posts

    // Si se especifica un stage ID en el env, usarlo directamente
    if (envStageId && /^\d+$/.test(envStageId)) {
      dealProperties.pipeline = envPipelineId;
      dealProperties.dealstage = envStageId;
      loggerService.debug(`Usando pipeline/stage desde .env: pipeline=${envPipelineId}, stage=${envStageId}`);
    } else {
      // Si no se especifica stage, obtener el primer stage del pipeline configurado
      const pipelineConfig = await getValidStageId(envPipelineId);
      
      if (pipelineConfig) {
        dealProperties.pipeline = pipelineConfig.pipelineId;
        dealProperties.dealstage = pipelineConfig.stageId;
        loggerService.debug(`Usando pipeline/stage automático: pipeline=${pipelineConfig.pipelineId}, stage=${pipelineConfig.stageId}`);
      } else {
        // Fallback: usar valores del env si son válidos
        if (/^\d+$/.test(envPipelineId)) {
          dealProperties.pipeline = envPipelineId;
        }
        
        if (envStageId && /^\d+$/.test(envStageId)) {
          dealProperties.dealstage = envStageId;
        } else {
          loggerService.warn('No se pudo obtener pipeline/stage válido');
          loggerService.warn('El deal se creará sin pipeline/stage específico');
        }
      }
    }

    // Crear el deal
    const dealData = {
      properties: dealProperties
    };

    loggerService.debug(`Creando deal en HubSpot: ${dealProperties.dealname}`);

    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals`,
      dealData,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    loggerService.success(`Deal creado en HubSpot: ${response.data.id}`);
    loggerService.info(`=== DEAL CREADO EXITOSAMENTE ===`);
    loggerService.info(`Deal ID: ${response.data.id}`);
    loggerService.info(`Deal Name: ${dealProperties.dealname}`);
    loggerService.info(`Profile URL: ${profileUrl || 'N/A'}`);
    loggerService.info(`Pipeline: ${dealProperties.pipeline || 'N/A'}`);
    loggerService.info(`Stage: ${dealProperties.dealstage || 'N/A'}`);
    loggerService.info('================================');
    return response.data;
  } catch (error) {
    loggerService.error('Error guardando en HubSpot', error);
    if (error.response) {
      loggerService.error(`Status: ${error.response.status}`);
      loggerService.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }
};

/**
 * Marcar un contacto como scrapeado en HubSpot
 */
const markContactAsScraped = async (contactId) => {
  if (!HUBSPOT_TOKEN) {
    loggerService.warn('HUBSPOT_TOKEN no configurado, no se puede marcar contacto como scrapeado');
    return false;
  }

  if (!contactId) {
    loggerService.warn('contactId no proporcionado, no se puede marcar contacto como scrapeado');
    return false;
  }

  try {
    loggerService.debug(`Marcando contacto ${contactId} como scrapeado en HubSpot`);

    const response = await axios.patch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contactId}`,
      {
        properties: {
          scrapeado_linkedin: 'true' // Propiedad personalizada para marcar como scrapeado
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200) {
      loggerService.debug(`✓ Contacto ${contactId} marcado exitosamente como scrapeado`);
      return true;
    } else {
      loggerService.warn(`✗ Respuesta inesperada (${response.status}) al marcar contacto ${contactId} como scrapeado`);
      return false;
    }
  } catch (error) {
    loggerService.error(`Error marcando contacto ${contactId} como scrapeado:`, error.message);

    if (error.response) {
      loggerService.error(`Status: ${error.response.status}, Response:`, JSON.stringify(error.response.data, null, 2));

      // Errores específicos de HubSpot
      if (error.response.status === 404) {
        loggerService.error(`Contacto ${contactId} no encontrado en HubSpot`);
      } else if (error.response.status === 401) {
        loggerService.error('Token de HubSpot inválido o expirado');
      } else if (error.response.status === 403) {
        loggerService.error('No tienes permisos para modificar este contacto');
      }
    }

    return false;
  }
};

/**
 * Obtener un deal específico por su ID con TODAS las propiedades
 */
const getDealById = async (dealId) => {
  if (!HUBSPOT_TOKEN) {
    throw new Error('HUBSPOT_TOKEN no está configurado en .env');
  }

  if (!dealId) {
    throw new Error('Deal ID es requerido');
  }

  try {
    loggerService.debug(`Obteniendo deal con ID: ${dealId}`);

    // No especificamos propiedades para obtener TODAS las disponibles automáticamente
    // HubSpot devuelve todas las propiedades con valores no vacíos cuando no se especifican
    const response = await axios.get(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deal = response.data;

    // Procesar las propiedades para extraer los valores correctamente
    const processedProperties = {};
    if (deal.properties) {
      for (const [key, value] of Object.entries(deal.properties)) {
        // En HubSpot, las propiedades pueden venir como objetos con 'value' o como valores directos
        processedProperties[key] = value?.value !== undefined ? value.value : value;
      }
    }

    loggerService.debug(`Deal obtenido exitosamente: ${deal.id} con ${Object.keys(processedProperties).length} propiedades`);

    // Devolver toda la información del deal con TODAS las propiedades
    const dealInfo = {
      id: deal.id,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      archived: deal.archived,
      properties: processedProperties
    };

    return dealInfo;

  } catch (error) {
    loggerService.error(`Error obteniendo deal ${dealId}:`, error.message);

    if (error.response) {
      if (error.response.status === 404) {
        throw new Error(`Deal con ID ${dealId} no encontrado`);
      }
      if (error.response.status === 401) {
        throw new Error('Token de HubSpot inválido o expirado');
      }
      if (error.response.status === 403) {
        throw new Error('No tienes permisos para acceder a este deal');
      }
    }

    throw new Error(`Error obteniendo deal: ${error.message}`);
  }
};

module.exports = {
  getLinkedInProfilesFromHubSpot,
  createDealForPost,
  markContactAsScraped,
  resetAllContactsScrapedStatus,
  areAllContactsScraped,
  getDealById
};

