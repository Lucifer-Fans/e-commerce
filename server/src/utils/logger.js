/* Tiny leveled logger — zero deps, structured enough for container log scraping. */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'production' ? 2 : 3);

const stamp = () => new Date().toISOString();

function write(level, msg) {
  if (LEVELS[level] > active) return;
  const line = `${stamp()} [${level.toUpperCase()}] ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (m) => write('error', m),
  warn: (m) => write('warn', m),
  info: (m) => write('info', m),
  debug: (m) => write('debug', m),
};
