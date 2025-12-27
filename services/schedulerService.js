const cron = require('node-cron');
const loggerService = require('./loggerService');
const scraperController = require('../controllers/scraperController');

let scheduledTask = null;
let isRunning = false;

/**
 * Iniciar el scheduler
 */
const startScheduler = () => {
  const intervalMinutes = parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '60');
  
  if (intervalMinutes < 1) {
    loggerService.warn('SCRAPE_INTERVAL_MINUTES debe ser al menos 1. Deshabilitando scheduler.');
    return;
  }

  // Convertir minutos a formato cron
  // Si es 60 minutos o más, usar formato de horas
  // Si es menos de 60, usar formato de minutos
  let cronExpression;
  
  if (intervalMinutes >= 60) {
    const hours = Math.floor(intervalMinutes / 60);
    cronExpression = `0 */${hours} * * *`; // Cada X horas
    loggerService.info(`Scheduler configurado: cada ${hours} hora(s)`);
  } else {
    cronExpression = `*/${intervalMinutes} * * * *`; // Cada X minutos
    loggerService.info(`Scheduler configurado: cada ${intervalMinutes} minuto(s)`);
  }

  // Detener tarea anterior si existe
  if (scheduledTask) {
    scheduledTask.stop();
  }

  // Crear nueva tarea programada
  scheduledTask = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      loggerService.warn('Proceso de scraping ya en ejecución, saltando esta ejecución...');
      return;
    }

    try {
      isRunning = true;
      loggerService.info('\n=== EJECUCIÓN PROGRAMADA INICIADA ===');
      loggerService.info(`Hora: ${new Date().toISOString()}`);
      
      // Ejecutar scraping
      await scraperController.runScheduledScrape();
      
      loggerService.info('=== EJECUCIÓN PROGRAMADA COMPLETADA ===\n');
    } catch (error) {
      loggerService.error('Error en ejecución programada:', error);
    } finally {
      isRunning = false;
    }
  }, {
    scheduled: true,
    timezone: "America/New_York" // Ajustar según necesidad
  });

  loggerService.success(`Scheduler iniciado. Ejecutando cada ${intervalMinutes} minuto(s)`);
};

/**
 * Detener el scheduler
 */
const stopScheduler = () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    loggerService.info('Scheduler detenido');
  }
};

/**
 * Obtener estado del scheduler
 */
const getSchedulerStatus = () => {
  return {
    isRunning: isRunning,
    isScheduled: scheduledTask !== null,
    intervalMinutes: parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '60')
  };
};

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus
};

