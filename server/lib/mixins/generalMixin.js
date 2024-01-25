'use strict';
/*global process, __dirname*/
const fs = require('fs');
const logger = require('../winston');
const config = require('../config');
const env = process.env.NODE_ENV || 'development';

const isMatchBroken = (resourceData, reference) => {
  let isBroken = resourceData.extension && resourceData.extension.find((extension) => {
    return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === reference;
  });
  return isBroken;
};

const getClientDisplayName = (clientid) => {
  let clients = config.get("clients");
  let clientDet = clients.find((client) => {
    return client.id === clientid;
  });
  if (clientDet) {
    return clientDet.displayName;
  }
  return '';
};

const getClientIdentifier = (resource) => {
  const internalIdURI = config.get("systems:internalid:uri");
  const validSystem = resource.identifier && resource.identifier.find(identifier => {
    return internalIdURI.includes(identifier.system) && identifier.value;
  });
  return validSystem;
};

const setNestedKey = (obj, path, value, callback) => {
  if (path.length === 1) {
    obj[path] = value;
    return callback();
  }
  setNestedKey(obj[path[0]], path.slice(1), value, () => {
    return callback();
  });
};

const updateConfigFile = (path, newValue, callback) => {
  const pathString = path.join(':');
  config.set(pathString, newValue);
  logger.info('Updating config file');
  const configFile = `${__dirname}/../../config/config_${env}.json`;
  const configData = require(configFile);
  setNestedKey(configData, path, newValue, () => {
    fs.writeFile(configFile, JSON.stringify(configData, 0, 2), (err) => {
      if (err) {
        throw err;
      }
      logger.info('Done updating config file');
      return callback();
    });
  });
};

const flattenComplex = extension => {
  let results = {};
  for (let ext of extension) {
    let value = '';
    for (let key of Object.keys(ext)) {
      if (key !== 'url') {
        value = ext[key];
      }
    }
    if (results[ext.url]) {
      if (Array.isArray(results[ext.url])) {
        results[ext.url].push(value);
      } else {
        results[ext.url] = [results[ext.url], value];
      }
    } else {
      if (Array.isArray(value)) {
        results[ext.url] = [value];
      } else {
        results[ext.url] = value;
      }
    }
  }
  return results;
};

const removeDir = function(path) {
  if (fs.existsSync(path)) {
    const files = fs.readdirSync(path);

    if (files.length > 0) {
      files.forEach(function(filename) {
        if (fs.statSync(path + "/" + filename).isDirectory()) {
          removeDir(path + "/" + filename);
        } else {
          fs.unlinkSync(path + "/" + filename);
        }
      });
      fs.rmdirSync(path);
    } else {
      fs.rmdirSync(path);
    }
  }
};

module.exports = {
  updateConfigFile,
  flattenComplex,
  getClientIdentifier,
  getClientDisplayName,
  isMatchBroken,
  removeDir
};