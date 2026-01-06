const axios = require('axios');

// Obtener token del argumento de línea de comandos
const HUBSPOT_TOKEN = process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Configuración por defecto (del código)
const DEFAULT_PIPELINE_ID = '811215668'; // Prospección
const DEFAULT_STAGE_ID = '1194313030'; // Hipótesis OK

// Parámetros opcionales desde línea de comandos
const PIPELINE_ID = process.argv[3] || DEFAULT_PIPELINE_ID;
const STAGE_ID = process.argv[4] || DEFAULT_STAGE_ID;

/**
 * Verificar deals en el stage donde se crean deals de posts
 */
const checkDealsInStage = async () => {
  if (!HUBSPOT_TOKEN) {
    console.error('❌ Error: Proporciona el token de HubSpot como argumento');
    console.error('Uso: node check-deals-in-stage.js TU_TOKEN_DE_HUBSPOT_AQUI [PIPELINE_ID] [STAGE_ID]');
    console.error('');
    console.error('Ejemplos:');
    console.error('  node check-deals-in-stage.js tu_token_aqui');
    console.error('  node check-deals-in-stage.js tu_token_aqui 811215668 1194313030');
    process.exit(1);
  }

  try {
    console.log('🔍 Verificando deals en el stage donde se crean deals de posts...\n');

    console.log(`📊 Pipeline ID: ${PIPELINE_ID}`);
    console.log(`📊 Stage ID: ${STAGE_ID}\n`);

    // Buscar deals en el stage específico
    const response = await axios.post(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: STAGE_ID
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_ID
              }
            ]
          }
        ],
        limit: 100, // Máximo 100 para ver una muestra
        properties: ['id', 'dealname', 'description', 'createdate', 'hs_lastmodifieddate']
      },
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deals = response.data.results || [];

    console.log('📋 RESULTADOS:');
    console.log(`Total de deals encontrados en este stage: ${deals.length}\n`);

    if (deals.length === 0) {
      console.log('✅ No hay deals en este stage. El sistema está limpio.');
      return;
    }

    // Filtrar deals que parecen ser de posts de LinkedIn
    const linkedinDeals = deals.filter(deal => {
      const description = deal.properties?.description || '';
      return description.includes('Post de LinkedIn') ||
             description.includes('linkedin.com/feed/update') ||
             deal.properties?.dealname?.includes('Post:');
    });

    console.log(`🔗 Deals que parecen ser de posts de LinkedIn: ${linkedinDeals.length}`);
    console.log(`📝 Otros deals en el stage: ${deals.length - linkedinDeals.length}\n`);

    if (linkedinDeals.length > 0) {
      console.log('📋 DETALLE DE DEALS DE LINKEDIN ENCONTRADOS:');
      console.log('=' .repeat(80));

      linkedinDeals.forEach((deal, index) => {
        const props = deal.properties;
        console.log(`${index + 1}. ID: ${deal.id}`);
        console.log(`   Nombre: ${props.dealname || 'N/A'}`);
        console.log(`   Creado: ${props.createdate || 'N/A'}`);
        console.log(`   Modificado: ${props.hs_lastmodifieddate || 'N/A'}`);

        // Extraer información del post
        const description = props.description || '';
        const postUrlMatch = description.match(/URL del post: (https:\/\/[^\s]+)/);
        const profileUrlMatch = description.match(/URL del perfil: (https:\/\/[^\s]+)/);

        if (postUrlMatch) {
          console.log(`   Post URL: ${postUrlMatch[1]}`);
        }
        if (profileUrlMatch) {
          console.log(`   Profile URL: ${profileUrlMatch[1]}`);
        }
        console.log('');
      });
    }

    // Mostrar resumen final
    console.log('📊 RESUMEN FINAL:');
    console.log(`- Total deals en el stage: ${deals.length}`);
    console.log(`- Deals de LinkedIn posts: ${linkedinDeals.length}`);
    console.log(`- Estado: ${linkedinDeals.length === 0 ? '✅ LIMPIO' : '⚠️  HAY DEALS PENDIENTES'}`);

  } catch (error) {
    console.error('❌ Error verificando deals:', error.message);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  checkDealsInStage();
}

module.exports = { checkDealsInStage };
