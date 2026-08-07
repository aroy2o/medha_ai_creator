/**
 * Minimal structured logger. Centralizing this (instead of scattering
 * console.* calls) makes it possible to audit that no secret values are
 * ever written to logs.
 */
type LogFields = Record<string, string | number | boolean | null | undefined>;

function format(level: string, message: string, fields?: LogFields) {
  const suffix = fields ? " " + JSON.stringify(fields) : "";
  return `[${new Date().toISOString()}] ${level} ${message}${suffix}`;
}

export const logger = {
  info(message: string, fields?: LogFields) {
    console.info(format("INFO", message, fields));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(format("WARN", message, fields));
  },
  error(message: string, fields?: LogFields) {
    console.error(format("ERROR", message, fields));
  },
};
