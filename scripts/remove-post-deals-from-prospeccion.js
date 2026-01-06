const axios = require('axios');

// Obtener token del argumento de línea de comandos
const HUBSPOT_TOKEN = process.argv[2];
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Pipeline Prospección donde pueden estar los deals antiguos
const PROSPECCION_PIPELINE_ID = '811215668';

/**
 * Buscar y eliminar deals con prefijo 'Post:' del pipeline Prospección
 */
const removePostDealsFromProspeccion = async () => {
  if (!HUBSPOT_TOKEN) {
    console.error('❌ Error: Proporciona el token de HubSpot como argumento');
    console.error('Uso: node remove-post-deals-from-prospeccion.js TU_TOKEN_DE_HUBSPOT_AQUI [--confirm]');
    console.error('');
    console.error('Ejemplos:');
    console.error('  node remove-post-deals-from-prospeccion.js tu_token_aqui');
    console.error('  node remove-post-deals-from-prospeccion.js tu_token_aqui --confirm');
    process.exit(1);
  }

  const confirmDeletion = process.argv.includes('--confirm');

  try {
    console.log('🔍 Buscando deals con prefijo "Post:" en el pipeline Prospección...\n');

    // Buscar deals en el pipeline Prospección que contengan "Post:" en el nombre
    let allDeals = [];
    let after = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PROSPECCION_PIPELINE_ID
              },
              {
                propertyName: 'dealname',
                operator: 'CONTAINS_TOKEN',
                value: 'Post:'
              }
            ]
          }
        ],
        limit: 100,
        properties: ['id', 'dealname', 'description', 'createdate', 'hs_lastmodifieddate', 'dealstage'],
        ...(after && { after })
      };

      const response = await axios.post(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/search`,
        params,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const deals = response.data.results || [];
      allDeals = allDeals.concat(deals);

      hasMore = response.data.paging && response.data.paging.next;
      after = hasMore ? response.data.paging.next.after : null;

      console.log(`   📄 Página obtenida: ${deals.length} deals encontrados (total acumulado: ${allDeals.length})`);
    }

    console.log(`\n📋 RESULTADOS DE BÚSQUEDA:`);
    console.log(`Total de deals con prefijo "Post:" en pipeline Prospección: ${allDeals.length}\n`);

    if (allDeals.length === 0) {
      console.log('✅ No hay deals con prefijo "Post:" en el pipeline Prospección.');
      console.log('   La limpieza ya está completa.');
      return;
    }

    // Mostrar detalles de los deals encontrados
    console.log('📋 DETALLE DE DEALS ENCONTRADOS:');
    console.log('=' .repeat(80));

    allDeals.forEach((deal, index) => {
      const props = deal.properties;
      console.log(`${index + 1}. ID: ${deal.id}`);
      console.log(`   Nombre: ${props.dealname || 'N/A'}`);
      console.log(`   Stage: ${props.dealstage || 'N/A'}`);
      console.log(`   Creado: ${props.createdate || 'N/A'}`);
      console.log('');
    });

    // Mostrar resumen
    console.log('📊 RESUMEN:');
    console.log(`- Deals encontrados: ${allDeals.length}`);
    console.log(`- Pipeline: Prospección (${PROSPECCION_PIPELINE_ID})`);
    console.log(`- Filtro: dealname contiene "Post:"`);

    if (!confirmDeletion) {
      console.log('\n⚠️  MODO VISTA PREVIA - No se eliminaron deals');
      console.log('💡 Para eliminar estos deals, ejecuta el comando con --confirm:');
      console.log(`   node remove-post-deals-from-prospeccion.js ${HUBSPOT_TOKEN} --confirm`);
      return;
    }

    // Modo confirmación - proceder con eliminación
    console.log('\n🗑️  MODO ELIMINACIÓN CONFIRMADA');
    console.log('⚠️  Se eliminarán TODOS los deals listados arriba');
    console.log('⏳ Iniciando eliminación...\n');

    let deletedCount = 0;
    let errors = 0;

    for (const deal of allDeals) {
      try {
        console.log(`   🗑️  Eliminando: ${deal.properties.dealname} (ID: ${deal.id})`);

        await axios.delete(
          `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${deal.id}`,
          {
            headers: {
              'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        deletedCount++;
        console.log(`   ✅ Eliminado exitosamente`);

        // Pequeña pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        errors++;
        console.error(`   ❌ Error eliminando deal ${deal.id}: ${error.message}`);
      }
    }

    console.log('\n📊 RESULTADO FINAL DE ELIMINACIÓN:');
    console.log(`- Deals eliminados: ${deletedCount}`);
    console.log(`- Errores: ${errors}`);
    console.log(`- Estado: ${errors === 0 ? '✅ COMPLETADO' : '⚠️  COMPLETADO CON ERRORES'}`);

  } catch (error) {
    console.error('❌ Error en el proceso:', error.message);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Respuesta: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  removePostDealsFromProspeccion();
}

module.exports = { removePostDealsFromProspeccion };
