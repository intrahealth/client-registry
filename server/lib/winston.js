const winston = require('winston');
const moment = require('moment');
require('winston-daily-rotate-file');
const fs = require('fs');
const logDir = '/var/log';
const logPrefix = 'openclientregistry-';
const maxLogFiles = 10;
const logDatePattern = 'YYYY-MM-DD-HH';
let transports = [ new winston.transports.Console() ];
if ( process.env.NODE_ENV !== "test" ) {
  let transport = new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: `${logPrefix}%DATE%.log`,
    datePattern: logDatePattern,
    zippedArchive: true,
    maxSize: '10m',
    maxFiles: '14d',
  });
  transport.on('rotate', () => {
    deleteOldLogs();
  });
  transport.on('new', () => {
    deleteOldLogs();
  });
  transport.on('archive', () => {
    deleteOldLogs();
  });
  transports.push( transport );
}

const logger = winston.createLogger({
  transports: transports,
  format: winston.format.combine(
    winston.format.colorize({
      all: true,
    }),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(
      info => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
});

function deleteOldLogs() {
  fs.readdir(logDir, (err, files) => {
    let logs = files.filter((file) => {
      return file.startsWith(logPrefix);
    });
    if(logs.length > maxLogFiles) {
      let keep = [];
      for(let file of logs) {
        if(keep.length < maxLogFiles) {
          keep.push(file);
          continue;
        }
        let removeKept = file.replace(logPrefix, '').split('.log')[0];
        let removeKeptIndex = -1;
        for(let index in keep) {
          let keptDate = keep[index].replace(logPrefix, '');
          keptDate = keep[index].split('.log')[0];
          if(moment(keptDate, logDatePattern) < moment(removeKept, logDatePattern)) {
            removeKept = keptDate;
            removeKeptIndex = index;
          }
        }
        if(removeKeptIndex !== -1) {
          keep.splice(removeKeptIndex, 1);
          keep.push(file);
        }
      }
      for(let file of logs) {
        let exist = keep.find((kp) => {
          return kp === file;
        });
        if(!exist) {
          try {
            fs.unlinkSync(`${logDir}/${file}`);
          } catch {
            continue;
          }
        }
      }
    }
  });
}
deleteOldLogs();
module.exports = logger;
