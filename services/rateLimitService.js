const fs = require('fs').promises;
const path = require('path');
const loggerService = require('./loggerService');

const MAX_PROFILES_PER_DAY = parseInt(process.env.MAX_PROFILES_PER_DAY || '50');
const RATE_LIMIT_FILE = path.join(__dirname, '../../data/rate-limit.json');

/**
 * Asegurar que el directorio de datos existe
 */
const ensureDataDir = async () => {
  const dataDir = path.dirname(RATE_LIMIT_FILE);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    loggerService.error('Error creando directorio de datos:', error);
  }
};

/**
 * Obtener datos de rate limit
 */
const getRateLimitData = async () => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(RATE_LIMIT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Si el archivo no existe, crear uno nuevo
    return {
      date: new Date().toISOString().split('T')[0],
      count: 0
    };
  }
};

/**
 * Guardar datos de rate limit
 */
const saveRateLimitData = async (data) => {
  try {
    await ensureDataDir();
    await fs.writeFile(RATE_LIMIT_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    loggerService.error('Error guardando datos de rate limit:', error);
  }
};

/**
 * Verificar si se puede procesar más perfiles hoy
 */
const canProcessMore = async () => {
  const data = await getRateLimitData();
  const today = new Date().toISOString().split('T')[0];
  
  // Si es un nuevo día, resetear contador
  if (data.date !== today) {
    loggerService.info(`Nuevo día detectado. Reseteando contador de rate limit.`);
    await saveRateLimitData({
      date: today,
      count: 0
    });
    return true;
  }
  
  // Verificar si se alcanzó el límite
  if (data.count >= MAX_PROFILES_PER_DAY) {
    loggerService.warn(`Límite diario alcanzado: ${data.count}/${MAX_PROFILES_PER_DAY}`);
    return false;
  }
  
  return true;
};

/**
 * Incrementar contador de perfiles procesados
 */
const incrementCount = async (amount = 1) => {
  const data = await getRateLimitData();
  const today = new Date().toISOString().split('T')[0];
  
  if (data.date !== today) {
    data.date = today;
    data.count = 0;
  }
  
  data.count += amount;
  await saveRateLimitData(data);
  
  loggerService.info(`Rate limit: ${data.count}/${MAX_PROFILES_PER_DAY} perfiles procesados hoy`);
  
  return data.count;
};

/**
 * Obtener estadísticas de rate limit
 */
const getStats = async () => {
  const data = await getRateLimitData();
  const today = new Date().toISOString().split('T')[0];
  
  if (data.date !== today) {
    return {
      date: today,
      count: 0,
      limit: MAX_PROFILES_PER_DAY,
      remaining: MAX_PROFILES_PER_DAY
    };
  }
  
  return {
    date: data.date,
    count: data.count,
    limit: MAX_PROFILES_PER_DAY,
    remaining: Math.max(0, MAX_PROFILES_PER_DAY - data.count)
  };
};

module.exports = {
  canProcessMore,
  incrementCount,
  getStats,
  MAX_PROFILES_PER_DAY
};

