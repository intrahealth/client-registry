const winston = require('winston');
require('winston-daily-rotate-file');

var transport = new winston.transports.DailyRotateFile({
  dirname: '/var/log',
  filename: 'openclientregistry-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '10m',
  maxFiles: '14d',
});

const logger = winston.createLogger({
  transports: [new winston.transports.Console(), transport],
  format: winston.format.combine(
    winston.format.colorize({
      all: true,
    }),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.simple()
  ),
});
module.exports = logger;
