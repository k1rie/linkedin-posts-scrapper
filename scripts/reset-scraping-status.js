require('dotenv').config();
const hubspotService = require('../services/hubspotService');
const loggerService = require('../services/loggerService');

/**
 * Script para resetear manualmente el estado de scraping de todos los contactos
 * Esto marca todos los contactos como NO scrapeados (scrapeado_linkedin = 'false')
 * Uso: node scripts/reset-scraping-status.js
 */
async function resetScrapingStatus() {
  try {
    loggerService.info('=== RESETEANDO ESTADO DE SCRAPING DE CONTACTOS ===');
    loggerService.warn('⚠️  ATENCIÓN: Esto marcará TODOS los contactos como NO scrapeados');
    loggerService.warn('Presiona Ctrl+C para cancelar si no quieres continuar...');

    // Esperar 3 segundos para dar tiempo a cancelar
    await new Promise(resolve => setTimeout(resolve, 3000));

    const resetResult = await hubspotService.resetAllContactsScrapedStatus();

    if (resetResult) {
      loggerService.success('✓ Estado de scraping reseteado exitosamente');
      loggerService.info('Ahora todos los contactos están marcados como NO scrapeados');
    } else {
      loggerService.error('✗ Error reseteando estado de scraping');
    }

  } catch (error) {
    loggerService.error('Error reseteando estado de scraping:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  resetScrapingStatus();
}

module.exports = { resetScrapingStatus };
