// src/utils/logger.js
// Logger structuré avec Winston — remplace console.log partout dans l'app

const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = format;

// Format lisible pour le développement
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} [${level}] ${message}\n${stack}`
      : `${timestamp} [${level}] ${message}`
  )
);

// Format JSON pour la production (facilite l'analyse avec des outils comme Datadog/Loki)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    // En production, on peut ajouter des fichiers de log rotatifs
    ...(process.env.NODE_ENV === 'production' ? [
      new transports.File({ filename: path.join('logs', 'error.log'),   level: 'error' }),
      new transports.File({ filename: path.join('logs', 'combined.log') }),
    ] : []),
  ],
  // Ne pas crasher le process sur une erreur de log
  exitOnError: false,
});

module.exports = logger;
