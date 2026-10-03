const logDebug = (message) => {
  console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`);
}

const logInfo = (message) => {
  console.log(`[${new Date().toISOString()}] INFO: ${message}`);
}

const logWarning = (message) => {
  console.warn(`[${new Date().toISOString()}] WARNING: ${message}`);
}

const logError = (message) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

module.exports = {
  logDebug,
  logInfo,
  logWarning,
  logError,
};
