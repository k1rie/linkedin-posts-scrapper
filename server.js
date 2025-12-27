require('dotenv').config();
const express = require('express');
const cors = require('cors');
const scraperRoutes = require('./routes/scraperRoutes');
const schedulerService = require('./services/schedulerService');
const scraperController = require('./controllers/scraperController');
const loggerService = require('./services/loggerService');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'linkedin-posts-apify'
  });
});

app.use('/api/scraper', scraperRoutes);

// Error handler
app.use((err, req, res, next) => {
  loggerService.error('Error en servidor:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error' 
  });
});

// Iniciar servidor
app.listen(PORT, async () => {
  loggerService.info(`\n=== SERVIDOR INICIADO ===`);
  loggerService.info(`Puerto: ${PORT}`);
  loggerService.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  
  // Ejecutar scraping inmediatamente al iniciar
  loggerService.info(`\n=== EJECUTANDO SCRAPING INICIAL ===`);
  try {
    await scraperController.runScheduledScrape();
    loggerService.success('Scraping inicial completado');
  } catch (error) {
    loggerService.error('Error en scraping inicial:', error);
  }
  
  // Iniciar scheduler si está configurado
  const intervalMinutes = parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '0');
  if (intervalMinutes > 0) {
    loggerService.info(`\nScheduler habilitado: cada ${intervalMinutes} minuto(s)`);
    schedulerService.startScheduler();
  } else {
    loggerService.info('Scheduler deshabilitado (SCRAPE_INTERVAL_MINUTES no configurado o 0)');
  }
  
  loggerService.info(`\nServidor escuchando en http://localhost:${PORT}`);
  loggerService.info(`Health check: http://localhost:${PORT}/health`);
  loggerService.info(`API: http://localhost:${PORT}/api/scraper\n`);
});

// Manejo de cierre graceful
process.on('SIGTERM', () => {
  loggerService.info('SIGTERM recibido, cerrando servidor...');
  schedulerService.stopScheduler();
  process.exit(0);
});

process.on('SIGINT', () => {
  loggerService.info('SIGINT recibido, cerrando servidor...');
  schedulerService.stopScheduler();
  process.exit(0);
});

