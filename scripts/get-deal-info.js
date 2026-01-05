require('dotenv').config();
const hubspotService = require('../services/hubspotService');
const loggerService = require('../services/loggerService');

/**
 * Script para obtener información de un deal específico por su ID
 * Uso: node scripts/get-deal-info.js <deal_id>
 */
const getDealInfo = async () => {
  try {
    // Obtener el deal ID desde los argumentos de línea de comandos
    const dealId = process.argv[2];

    if (!dealId) {
      console.error('❌ Error: Se requiere el ID del deal como parámetro');
      console.log('Uso: node scripts/get-deal-info.js <deal_id>');
      console.log('Ejemplo: node scripts/get-deal-info.js 1234567890');
      process.exit(1);
    }

    // Validar que el deal ID sea un número
    if (!/^\d+$/.test(dealId)) {
      console.error('❌ Error: El ID del deal debe ser un número válido');
      process.exit(1);
    }

    loggerService.info(`=== OBTENIENDO INFORMACIÓN DEL DEAL ${dealId} ===`);

    // Obtener la información del deal
    const dealInfo = await hubspotService.getDealById(dealId);

    // Función auxiliar para formatear valores
    const formatValue = (value) => {
      if (value === null || value === undefined || value === '') return 'N/A';
      if (typeof value === 'boolean') return value ? 'Sí' : 'No';
      if (typeof value === 'string' && /^\d+$/.test(value) && value.length === 13) {
        // Timestamp de HubSpot (13 dígitos)
        return new Date(parseInt(value)).toLocaleString('es-ES');
      }
      return value;
    };

    // Mostrar toda la información del deal
    console.log('\n📋 INFORMACIÓN COMPLETA DEL DEAL');
    console.log(`🔢 Total de propiedades obtenidas: ${Object.keys(dealInfo.properties).length}`);
    console.log('='.repeat(60));

    // Información básica del objeto
    console.log('🔹 INFORMACIÓN DEL OBJETO:');
    console.log(`   ID del Deal: ${dealInfo.id}`);
    console.log(`   Estado: ${dealInfo.archived ? 'Archivado' : 'Activo'}`);
    console.log(`   Fecha de creación (objeto): ${dealInfo.createdAt ? new Date(dealInfo.createdAt).toLocaleString('es-ES') : 'N/A'}`);
    console.log(`   Última actualización (objeto): ${dealInfo.updatedAt ? new Date(dealInfo.updatedAt).toLocaleString('es-ES') : 'N/A'}`);
    console.log('');

    // Propiedades principales (las más comunes)
    const mainProperties = ['dealname', 'amount', 'deal_currency_code', 'pipeline', 'dealstage', 'dealtype', 'description'];
    console.log('⭐ PROPIEDADES PRINCIPALES:');
    mainProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      console.log(`   ${prop}: ${formatValue(value)}`);
    });
    console.log('');

    // Fechas importantes
    const dateProperties = ['createdate', 'hs_lastmodifieddate', 'closedate'];
    console.log('📅 FECHAS IMPORTANTES:');
    dateProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      console.log(`   ${prop}: ${formatValue(value)}`);
    });
    console.log('');

    // Estados del deal
    const statusProperties = ['hs_is_closed', 'hs_is_closed_won', 'hs_deal_stage_probability'];
    console.log('📊 ESTADOS DEL DEAL:');
    statusProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      console.log(`   ${prop}: ${formatValue(value)}`);
    });
    console.log('');

    // Analytics
    const analyticsProperties = ['hs_analytics_source', 'hs_analytics_source_data_1', 'hs_analytics_source_data_2'];
    console.log('📈 ANALYTICS:');
    analyticsProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      console.log(`   ${prop}: ${formatValue(value)}`);
    });
    console.log('');

    // Propiedades específicas de LinkedIn/Post
    const linkedinProperties = ['link_original_de_la_noticia'];
    console.log('🔗 PROPIEDADES DE LINKEDIN:');
    linkedinProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      console.log(`   ${prop}: ${formatValue(value)}`);
    });
    console.log('');

    // TODAS las propiedades disponibles
    console.log('🔍 TODAS LAS PROPIEDADES DISPONIBLES:');
    console.log(`Total de propiedades encontradas: ${Object.keys(dealInfo.properties).length}`);
    console.log('='.repeat(50));

    // Ordenar las propiedades alfabéticamente para mejor legibilidad
    const sortedProperties = Object.keys(dealInfo.properties).sort();

    sortedProperties.forEach(prop => {
      const value = dealInfo.properties[prop];
      const displayValue = formatValue(value);
      console.log(`${prop}: ${displayValue}`);
    });
    console.log('');

    // Mostrar el JSON completo para desarrolladores
    console.log('💻 JSON COMPLETO (para desarrolladores):');
    console.log('-'.repeat(45));
    console.log(JSON.stringify(dealInfo, null, 2));
    console.log('');

    loggerService.success(`Información del deal ${dealId} obtenida exitosamente`);
    process.exit(0);

  } catch (error) {
    loggerService.error('Error obteniendo información del deal:', error.message);
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

// Ejecutar el script
getDealInfo();
