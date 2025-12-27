require('dotenv').config();
const scraperController = require('../controllers/scraperController');
const loggerService = require('../services/loggerService');

/**
 * Script para ejecutar scraping desde línea de comandos
 */
const runScrape = async () => {
  try {
    loggerService.info('=== INICIANDO SCRAPING DESDE LÍNEA DE COMANDOS ===');
    
    const result = await scraperController.runScheduledScrape();
    
    if (result.success) {
      loggerService.success('Scraping completado exitosamente');
      loggerService.info(`Resumen: ${JSON.stringify(result.summary, null, 2)}`);
      process.exit(0);
    } else {
      loggerService.error('Scraping falló:', result.error);
      process.exit(1);
    }
  } catch (error) {
    loggerService.error('Error ejecutando scraping:', error);
    process.exit(1);
  }
};

// Ejecutar
runScrape();

