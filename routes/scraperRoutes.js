const express = require('express');
const router = express.Router();
const scraperController = require('../controllers/scraperController');
const rateLimitService = require('../services/rateLimitService');
const schedulerService = require('../services/schedulerService');

/**
 * POST /api/scraper/extract-posts
 * Extraer posts de perfiles de LinkedIn
 */
router.post('/extract-posts', scraperController.extractPosts);

/**
 * GET /api/scraper/stats
 * Obtener estadísticas de rate limit
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await rateLimitService.getStats();
    const schedulerStatus = schedulerService.getSchedulerStatus();
    
    res.json({
      success: true,
      rateLimit: stats,
      scheduler: schedulerStatus
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

/**
 * POST /api/scraper/run-now
 * Ejecutar scraping manualmente
 */
router.post('/run-now', async (req, res) => {
  try {
    const result = await scraperController.runScheduledScrape();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

module.exports = router;

