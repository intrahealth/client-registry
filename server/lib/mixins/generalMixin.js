"use strict";
/*global process, __dirname*/
const fs = require("fs");
const logger = require("../winston");
const config = require("../config");
const env = process.env.NODE_ENV || "development";

const initialCounterValue = config.get("uniqueIdentifier:IdentifierBase");

const UniqueIdentifierPrefix = config.get("uniqueIdentifier:Prefix");

const identifierLength = parseInt(config.get("uniqueIdentifier:Length"), 10);

const createPatientIdentifierGenerator = (initialCounter) => {
  // Function to calculate the Luhn check digit
  function calculateAlphabetCheckDigit(number) {
    let sum = 0;
    let shouldDouble = true;

    // Process the number from right to left
    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i), 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    // Calculate the check digit as the sum modulo 26
    const checkDigitIndex = sum % 26;

    // Map the check digit index to an alphabet character
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return alphabet[checkDigitIndex];
  }

  return () => {
    const uniqueNumber = initialCounter++; // Increment initialCounter after assigning it to uniqueNumber
    const uniqueNumberStr = uniqueNumber.toString().padStart(identifierLength, "0");
    const checkDigit = calculateAlphabetCheckDigit(uniqueNumberStr);
    return `${UniqueIdentifierPrefix}-${uniqueNumberStr}${checkDigit}`; // Append the check digit to the unique identifier
  };
};

// Create an instance of the identifier generator with an external counter value
const generatePatientUniqueIdentifier = createPatientIdentifierGenerator(initialCounterValue);


const isMatchBroken = (resourceData, reference) => {
  let isBroken =
    resourceData.extension &&
    resourceData.extension.find((extension) => {
      return (
        extension.url === config.get("systems:brokenMatch:uri") &&
        extension.valueReference.reference === reference
      );
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
  return "";
};

const getClientIdentifier = (resource) => {
  const internalIdURI = config.get("systems:internalid:uri");
  const validSystem =
    resource.identifier &&
    resource.identifier.find((identifier) => {
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
  const pathString = path.join(":");
  config.set(pathString, newValue);
  logger.info("Updating config file");
  const configFile = `${__dirname}/../../config/config_${env}.json`;
  const configData = require(configFile);
  setNestedKey(configData, path, newValue, () => {
    fs.writeFile(configFile, JSON.stringify(configData, 0, 2), (err) => {
      if (err) {
        throw err;
      }
      logger.info("Done updating config file");
      return callback();
    });
  });
};

const flattenComplex = (extension) => {
  let results = {};
  for (let ext of extension) {
    let value = "";
    for (let key of Object.keys(ext)) {
      if (key !== "url") {
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

const removeDir = function (path) {
  if (fs.existsSync(path)) {
    const files = fs.readdirSync(path);

    if (files.length > 0) {
      files.forEach(function (filename) {
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
  generatePatientUniqueIdentifier,
  updateConfigFile,
  flattenComplex,
  getClientIdentifier,
  getClientDisplayName,
  isMatchBroken,
  removeDir,
};
