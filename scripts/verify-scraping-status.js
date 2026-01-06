require('dotenv').config();
const hubspotService = require('../services/hubspotService');
const loggerService = require('../services/loggerService');

/**
 * Script para verificar el estado de scraping de los contactos en HubSpot
 * Uso: node scripts/verify-scraping-status.js
 */
async function verifyScrapingStatus() {
  try {
    loggerService.info('=== VERIFICANDO ESTADO DE SCRAPING DE CONTACTOS ===');

    // Verificar si todos los contactos están scrapeados
    const allScraped = await hubspotService.areAllContactsScraped();

    if (allScraped) {
      loggerService.success('✓ Todos los contactos están marcados como scrapeados');
    } else {
      loggerService.warn('⚠️ Algunos contactos no están marcados como scrapeados');
    }

    // Obtener estadísticas detalladas
    loggerService.info('\n=== OBTENIENDO ESTADÍSTICAS DETALLADAS ===');

    const profiles = await hubspotService.getLinkedInProfilesFromHubSpot();
    loggerService.info(`Total de perfiles encontrados: ${profiles.length}`);

    // Mostrar algunos ejemplos de perfiles
    if (profiles.length > 0) {
      loggerService.info('\nPrimeros 5 perfiles:');
      profiles.slice(0, 5).forEach((profile, index) => {
        loggerService.info(`${index + 1}. ${profile.contactName} - ${profile.linkedinUrl}`);
      });
    }

    loggerService.info('\n=== VERIFICACIÓN COMPLETADA ===');

  } catch (error) {
    loggerService.error('Error verificando estado de scraping:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  verifyScrapingStatus();
}

module.exports = { verifyScrapingStatus };
