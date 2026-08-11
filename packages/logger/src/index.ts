export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug: (message: string, fields?: Record<string, unknown>) => void;
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

const secretKeyPattern = /(token|secret|password|private.?key|cookie|authorization|api.?key)/i;

function safeFields(fields: Record<string, unknown> | undefined) {
  if (!fields) return undefined;
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      secretKeyPattern.test(key) ? '[REDACTED]' : value,
    ]),
  );
}

export function createLogger(service: string, level: LogLevel = 'info'): Logger {
  const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const write = (entryLevel: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (rank[entryLevel] < rank[level]) return;
    const record = {
      timestamp: new Date().toISOString(),
      level: entryLevel,
      service,
      message,
      ...safeFields(fields),
    };
    const output = JSON.stringify(record);
    if (entryLevel === 'error') console.error(output);
    else if (entryLevel === 'warn') console.warn(output);
    else console.log(output);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
