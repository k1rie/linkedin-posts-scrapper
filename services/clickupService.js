const axios = require('axios');
const loggerService = require('./loggerService');

const checkDuplicate = async (postLink, clickupToken, clickupListId) => {
  try {
    // Buscar tareas existentes en la lista
    const response = await axios.get(
      `https://api.clickup.com/api/v2/list/${clickupListId}/task?archived=false`,
      {
        headers: {
          'Authorization': clickupToken,
          'Content-Type': 'application/json'
        },
        params: {
          page: 0,
          order_by: 'created',
          reverse: true,
          subtasks: false,
          statuses: [],
          include_closed: false
        }
      }
    );

    const tasks = response.data.tasks || [];
    
    // Buscar si ya existe una tarea con el mismo link de post
    for (const task of tasks) {
      if (task.description && task.description.includes(postLink)) {
        loggerService.debug(`Post duplicado encontrado: ${task.id}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    loggerService.warn('Error verificando duplicados, continuando de todas formas', error);
    return false; // Si hay error, continuar de todas formas
  }
};

const saveToClickUp = async (profileUrl, postData, profileName = null) => {
  const clickupToken = process.env.CLICKUP_API_TOKEN;
  const clickupListId = process.env.CLICKUP_POSTS_LIST_ID || process.env.CLICKUP_LIST_ID || '901708866984';

  if (!clickupToken) {
    loggerService.warn('CLICKUP_API_TOKEN no está configurado, saltando guardado en ClickUp');
    return null;
  }

  if (!postData || !postData.url) {
    loggerService.warn('No hay datos de post para guardar');
    return null;
  }

  // Asegurar que profileName sea un string válido
  let safeProfileName = null;
  if (profileName) {
    if (typeof profileName === 'string') {
      safeProfileName = profileName.trim();
    } else if (typeof profileName === 'object' && profileName !== null) {
      // Si es un objeto, extraer el nombre de la propiedad 'name'
      safeProfileName = profileName.name || profileName.contactName || profileName.author || profileName.authorName || null;
      if (safeProfileName && typeof safeProfileName !== 'string') {
        safeProfileName = String(safeProfileName);
      }
    } else {
      safeProfileName = String(profileName);
    }
  }
  
  // Si aún no tenemos nombre, intentar obtenerlo del postData.author
  if (!safeProfileName && postData.author) {
    if (typeof postData.author === 'string') {
      safeProfileName = postData.author;
    } else if (typeof postData.author === 'object' && postData.author !== null) {
      safeProfileName = postData.author.name || postData.author.authorName || null;
      if (safeProfileName && typeof safeProfileName !== 'string') {
        safeProfileName = String(safeProfileName);
      }
    } else {
      safeProfileName = String(postData.author);
    }
  }

  const postLink = postData.url;

  try {
    // Verificar duplicados
    loggerService.debug(`Verificando duplicados para: ${postLink}`);
    const isDuplicate = await checkDuplicate(postLink, clickupToken, clickupListId);
    
    if (isDuplicate) {
      loggerService.warn(`Post duplicado encontrado, saltando: ${postLink}`);
      return { duplicate: true, id: null };
    }

    // Obtener los status disponibles de la lista
    let validStatus = null;
    try {
      const listResponse = await axios.get(
        `https://api.clickup.com/api/v2/list/${clickupListId}`,
        {
          headers: {
            'Authorization': clickupToken,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const statuses = listResponse.data.statuses || [];
      if (statuses.length > 0) {
        validStatus = statuses[0].status;
        loggerService.debug(`Status válido encontrado: ${validStatus}`);
      }
    } catch (statusError) {
      loggerService.debug('No se pudo obtener status de la lista, creando sin status específico');
    }

    // Construir descripción con información del post
    const authorName = safeProfileName || (postData.author && typeof postData.author === 'string' ? postData.author : 'No disponible');
    const taskName = safeProfileName || (postData.author && typeof postData.author === 'string' ? postData.author : profileUrl.split('/in/')[1]?.replace('/', '') || 'Perfil');
    
    let description = `**Post de LinkedIn**\n\n`;
    description += `**Autor:** ${authorName}\n`;
    description += `**Perfil:** ${profileUrl}\n`;
    description += `**URL del post:** ${postLink}\n\n`;
    
    if (postData.text) {
      description += `**Contenido:**\n${postData.text.substring(0, 500)}${postData.text.length > 500 ? '...' : ''}\n\n`;
    }
    
    if (postData.createdAt) {
      description += `**Fecha:** ${postData.createdAt}\n`;
    }

    const taskData = {
      name: `${taskName} - Post de LinkedIn`,
      description: description,
      priority: 3
    };

    if (validStatus) {
      taskData.status = validStatus;
    }

    loggerService.debug(`Creando tarea en ClickUp: ${taskData.name}`);

    const response = await axios.post(
      `https://api.clickup.com/api/v2/list/${clickupListId}/task`,
      taskData,
      {
        headers: {
          'Authorization': clickupToken,
          'Content-Type': 'application/json'
        }
      }
    );

    loggerService.success(`Tarea creada en ClickUp: ${response.data.id}`);
    return response.data;
  } catch (error) {
    loggerService.error('Error guardando en ClickUp', error);
    if (error.response) {
      loggerService.error(`Status: ${error.response.status}`);
      loggerService.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }
};

module.exports = {
  saveToClickUp
};

