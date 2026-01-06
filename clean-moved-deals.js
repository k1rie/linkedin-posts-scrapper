const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Obtener token del argumento de línea de comandos
const HUBSPOT_TOKEN = process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_LIST_ID = '5557'; // Lista que usa linkedin-posts-apify

/**
 * Leer los logs y extraer todos los deal IDs que se movieron
 */
function extractMovedDealIds(logPath) {
  console.log('📄 Leyendo logs para extraer deal IDs movidos...');

  try {
    const logContent = fs.readFileSync(logPath, 'utf8');
    const lines = logContent.split('\n');

    const dealIds = [];
    const movePattern = /📤 Moviendo: (\d+):/;

    for (const line of lines) {
      const match = line.match(movePattern);
      if (match) {
        dealIds.push(match[1]);
      }
    }

    console.log(`✅ Encontrados ${dealIds.length} deal IDs en los logs`);
    return dealIds;
  } catch (error) {
    console.error('❌ Error leyendo archivo de logs:', error.message);
    return [];
  }
}

/**
 * Obtener todos los perfiles de LinkedIn de la lista de HubSpot
 */
async function getLinkedInProfilesFromList() {
  console.log('📄 Obteniendo perfiles de LinkedIn de la lista HubSpot...');

  try {
    let contacts = [];
    let after = null;
    let hasMore = true;
    let attempts = 0;
    const maxAttempts = 150;

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
        console.log(`   Página ${attempts}...`);
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
        console.error(`Error en página ${attempts}:`, error.message);
        hasMore = false;
      }
    }

    // Extraer URLs de LinkedIn válidas
    const linkedinUrls = new Set();
    let contactsWithLinkedIn = 0;

    for (const contact of contacts) {
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

      if (linkedinUrl && typeof linkedinUrl === 'string' && linkedinUrl.includes('linkedin.com/in/')) {
        linkedinUrl = linkedinUrl.split('?')[0].split('#')[0]; // Limpiar URL
        linkedinUrls.add(linkedinUrl);
        contactsWithLinkedIn++;
      }
    }

    console.log(`✅ Encontrados ${contactsWithLinkedIn} perfiles únicos de LinkedIn en la lista`);
    return linkedinUrls;
  } catch (error) {
    console.error('❌ Error obteniendo perfiles de HubSpot:', error);
    return new Set();
  }
}

/**
 * Obtener información completa de un deal incluyendo asociaciones
 */
async function getDealInfo(dealId) {
  try {
    // Obtener propiedades del deal
    const response = await axios.get(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        params: {
          properties: 'dealname,description,link_original_de_la_noticia'
        }
      }
    );

    const deal = response.data;
    const props = deal.properties || {};

    // Obtener asociaciones con contactos
    const associationsResponse = await axios.get(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}/associations/contacts`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const contactAssociations = associationsResponse.data.results || [];
    const contactIds = contactAssociations.map(assoc => assoc.id);

    return {
      id: deal.id,
      name: props.dealname || '',
      description: props.description || '',
      postUrl: props.link_original_de_la_noticia || '',
      associatedContactIds: contactIds
    };
  } catch (error) {
    console.error(`❌ Error obteniendo deal ${dealId}:`, error.message);
    return null;
  }
}

/**
 * Extraer URL del perfil de LinkedIn de la descripción del deal
 */
function extractLinkedInProfileFromDescription(description) {
  // Buscar patrones como "URL del perfil: https://www.linkedin.com/in/usuario"
  const profileUrlPattern = /URL del perfil:\s*(https:\/\/[^\s\n]+)/i;
  const match = description.match(profileUrlPattern);

  if (match) {
    let url = match[1].split('?')[0].split('#')[0]; // Limpiar URL
    return url;
  }

  return null;
}

/**
 * Eliminar un deal y sus contactos asociados
 */
async function deleteDealAndContacts(dealId, dealName, contactIds = []) {
  let successCount = 0;
  let failCount = 0;

  try {
    // Primero eliminar los contactos asociados
    for (const contactId of contactIds) {
      try {
        await axios.delete(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contactId}`,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ Eliminado contacto: ${contactId} (asociado a ${dealName})`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error eliminando contacto ${contactId}:`, error.message);
        failCount++;
      }

      // Pausa pequeña entre eliminaciones
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Luego eliminar el deal
    await axios.delete(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${dealId}`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Eliminado deal: ${dealName} (ID: ${dealId})`);
    successCount++;

    return { success: true, deletedItems: successCount, failedItems: failCount };
  } catch (error) {
    console.error(`❌ Error eliminando deal ${dealId}:`, error.message);
    return { success: false, deletedItems: successCount, failedItems: failCount + 1 };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando limpieza de deals y contactos movidos que no están en la lista...\n');

  if (!HUBSPOT_TOKEN) {
    console.error('❌ Error: Proporciona el token de HubSpot como argumento');
    console.error('Uso: node clean-moved-deals.js TU_TOKEN_DE_HUBSPOT_AQUI [ruta_logs]');
    process.exit(1);
  }

  // Ruta del archivo de logs
  const logPath = process.argv[3] || '/Users/diegoguerrero/Downloads/logs.1767654089116.log';

  if (!fs.existsSync(logPath)) {
    console.error(`❌ Archivo de logs no encontrado: ${logPath}`);
    process.exit(1);
  }

  // 1. Extraer deal IDs de los logs
  const movedDealIds = extractMovedDealIds(logPath);
  if (movedDealIds.length === 0) {
    console.error('❌ No se encontraron deal IDs en los logs');
    process.exit(1);
  }

  // 2. Obtener perfiles de LinkedIn de la lista de HubSpot
  const linkedinProfilesInList = await getLinkedInProfilesFromList();
  if (linkedinProfilesInList.size === 0) {
    console.error('❌ No se pudieron obtener perfiles de la lista de HubSpot');
    process.exit(1);
  }

  console.log(`\n🔍 Analizando ${movedDealIds.length} deals movidos...\n`);

  // 3. Analizar cada deal movido
  const dealsToDelete = [];
  let analyzedCount = 0;

  for (const dealId of movedDealIds) {
    analyzedCount++;
    if (analyzedCount % 50 === 0) {
      console.log(`   Analizados: ${analyzedCount}/${movedDealIds.length}`);
    }

    const dealInfo = await getDealInfo(dealId);
    if (!dealInfo) {
      console.log(`⚠️  No se pudo obtener info del deal ${dealId}, omitiendo`);
      continue;
    }

    // Extraer URL del perfil de LinkedIn del deal
    const profileUrl = extractLinkedInProfileFromDescription(dealInfo.description);

    if (!profileUrl) {
      console.log(`⚠️  No se encontró URL de perfil en deal ${dealId}: ${dealInfo.name}`);
      continue;
    }

    // Verificar si el perfil está en la lista de HubSpot
    const isInList = linkedinProfilesInList.has(profileUrl);

    if (!isInList) {
      dealsToDelete.push({
        id: dealId,
        name: dealInfo.name,
        profileUrl: profileUrl,
        associatedContactIds: dealInfo.associatedContactIds || []
      });
      console.log(`🎯 Para eliminar: ${dealInfo.name} (perfil no en lista) + ${dealInfo.associatedContactIds?.length || 0} contactos`);
    } else {
      console.log(`✅ Mantener: ${dealInfo.name} (perfil en lista)`);
    }

    // Pequeña pausa para no sobrecargar la API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 4. Calcular totales
  const totalContactsToDelete = dealsToDelete.reduce((sum, deal) => sum + (deal.associatedContactIds?.length || 0), 0);

  // 5. Mostrar resumen y pedir confirmación
  console.log(`\n📊 RESUMEN:`);
  console.log(`Total deals movidos: ${movedDealIds.length}`);
  console.log(`Deals a eliminar: ${dealsToDelete.length}`);
  console.log(`Contactos asociados a eliminar: ${totalContactsToDelete}`);
  console.log(`Total items a eliminar: ${dealsToDelete.length + totalContactsToDelete}`);
  console.log(`Deals a mantener: ${movedDealIds.length - dealsToDelete.length}`);

  if (dealsToDelete.length === 0) {
    console.log('\n✅ No hay deals para eliminar');
    return;
  }

  console.log('\n📋 Deals y contactos que serán eliminados:');
  dealsToDelete.slice(0, 10).forEach((deal, index) => {
    console.log(`  ${index + 1}. ${deal.name}`);
    console.log(`     Perfil: ${deal.profileUrl}`);
    console.log(`     Contactos asociados: ${deal.associatedContactIds?.length || 0}`);
  });

  if (dealsToDelete.length > 10) {
    console.log(`  ... y ${dealsToDelete.length - 10} más`);
  }

  console.log('\n⚠️  ATENCIÓN: Esta acción eliminará tanto DEALS como CONTACTOS asociados y NO se puede deshacer.');
  console.log('¿Deseas continuar con la eliminación? (Escribe "SI" para confirmar)');

  // En Node.js, usar readline para confirmación
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('', async (answer) => {
    if (answer.toUpperCase() === 'SI') {
      console.log('\n🗑️  Eliminando deals...\n');

      let totalDeletedItems = 0;
      let totalFailedItems = 0;

      for (const deal of dealsToDelete) {
        const result = await deleteDealAndContacts(deal.id, deal.name, deal.associatedContactIds);
        totalDeletedItems += result.deletedItems;
        totalFailedItems += result.failedItems;

        // Pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      console.log(`\n📊 Resultado final:`);
      console.log(`✅ Items eliminados exitosamente: ${totalDeletedItems}`);
      console.log(`❌ Items que fallaron: ${totalFailedItems}`);
      console.log(`🎯 Total procesados: ${dealsToDelete.length} deals (+ ${totalDeletedItems - dealsToDelete.length} contactos)`);

    } else {
      console.log('❌ Operación cancelada por el usuario.');
    }

    rl.close();
  });
}

// Ejecutar
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  extractMovedDealIds,
  getLinkedInProfilesFromList,
  extractLinkedInProfileFromDescription,
  deleteDealAndContacts
};
