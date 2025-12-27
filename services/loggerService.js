/**
 * LOGGING & MONITORING LAYER
 * Comprehensive logging with daily reports
 */

const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const LOG_DIR = path.join(__dirname, '../../data/logs');
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';

/**
 * Ensure log directories exist
 */
const ensureLogDirs = async () => {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating log directories:', error.message);
  }
};

/**
 * Format log entry
 */
const formatLogEntry = (level, message, metadata = {}) => {
  const timestamp = new Date().toISOString();
  return {
    timestamp,
    level,
    message,
    ...metadata,
  };
};

/**
 * Write log to file
 */
const writeLog = async (level, message, metadata = {}) => {
  try {
    await ensureLogDirs();
    
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `${today}.log`);
    
    const entry = formatLogEntry(level, message, metadata);
    const logLine = JSON.stringify(entry) + '\n';
    
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    console.error('Error writing log:', error.message);
  }
};

/**
 * Log levels
 */
const debug = (message, metadata) => {
  if (CURRENT_LOG_LEVEL === 'DEBUG') {
    console.debug(`[DEBUG] ${message}`, metadata || '');
  }
  writeLog('DEBUG', message, metadata);
};

const info = (message, metadata) => {
  console.log(`[INFO] ${message}`, metadata || '');
  writeLog('INFO', message, metadata);
};

const warn = (message, metadata) => {
  console.warn(`[WARN] ${message}`, metadata || '');
  writeLog('WARN', message, metadata);
};

const error = (message, metadata) => {
  console.error(`[ERROR] ${message}`, metadata || '');
  writeLog('ERROR', message, metadata);
};

const success = (message, metadata) => {
  console.log(`✓ ${message}`, metadata || '');
  writeLog('SUCCESS', message, metadata);
};

const critical = (message, metadata) => {
  console.error(`[CRITICAL] ${message}`, metadata || '');
  writeLog('CRITICAL', message, metadata);
};

/**
 * Log request
 */
const logRequest = async (url, status, metadata = {}) => {
  await writeLog('INFO', 'Request', {
    type: 'request',
    url,
    status,
    ...metadata,
  });
};

/**
 * Log error response
 */
const logError = async (url, statusCode, errorType, metadata = {}) => {
  const level = statusCode === 403 ? 'CRITICAL' : statusCode === 429 ? 'WARN' : 'ERROR';
  await writeLog(level, 'Request Error', {
    type: 'error',
    url,
    statusCode,
    errorType,
    ...metadata,
  });
  
  if (statusCode === 403) {
    critical('403 Forbidden - Account may be restricted', { url, ...metadata });
  }
};

// Initialize
ensureLogDirs();

module.exports = {
  debug,
  info,
  warn,
  error,
  success,
  critical,
  logRequest,
  logError,
};

