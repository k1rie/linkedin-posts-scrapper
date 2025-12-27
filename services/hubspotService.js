const axios = require('axios');
const loggerService = require('./loggerService');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_LIST_ID = process.env.HUBSPOT_LIST_ID || '5557';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

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
      
      const properties = ['linkedin', 'hs_linkedin_url', 'linkedin_profile_link', 'firstname', 'lastname', 'name'];
      
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
    loggerService.info(`Procesando contactos para extraer URLs de LinkedIn...`);
    
    const profiles = [];
    let contactsWithLinkedIn = 0;
    let contactsWithoutLinkedIn = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const properties = contact.properties || {};
      
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
        
        if (profileUrl.includes('linkedin.com/in/')) {
          profileUrl = profileUrl.split('?')[0].split('#')[0];
          
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
    loggerService.info(`- Total contactos procesados: ${contacts.length}`);
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
      dealname: `${authorName} - Post LinkedIn`,
      description: description,
      amount: '0', // Sin monto inicial
      deal_currency_code: 'MXN'
    };

    // Obtener pipeline y stage desde .env o usar valores por defecto
    const envPipelineId = process.env.HUBSPOT_PIPELINE_ID || '811215668'; // Default: Prospección
    const envStageId = process.env.HUBSPOT_DEAL_STAGE_ID;

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

module.exports = {
  getLinkedInProfilesFromHubSpot,
  createDealForPost
};

