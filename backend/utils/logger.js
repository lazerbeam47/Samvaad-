// utils/logger.js
// Very simple logger wrapper (can replace with Winston / Pino later)

function log(level, ...args) {
  console.log(`[${level.toUpperCase()}]`, ...args);
}

module.exports = {
  info: (...args) => log("info", ...args),
  error: (...args) => log("error", ...args),
  debug: (...args) => log("debug", ...args),
};
