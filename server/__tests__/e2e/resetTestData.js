const axios = require("axios");
const URI = require('urijs');
const config = require('../../lib/config');
const logger = require('../../lib/winston');
const patientsBundle = require('./fhirresources/patientsBundle.json');

logger.info("Adding default patients data used for running tests");
const options = {
  url: URI(config.get('fhirServer:baseURL')).toString(),
  method: "POST",
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  auth: {
    username: config.get('fhirServer:username'),
    password: config.get('fhirServer:password'),
  },
  data: patientsBundle,
};

axios(options).then((resp) => {
  if (resp.status < 200 || resp.status > 299) {
    logger.error(JSON.stringify(resp, 0, 2));
  } else {
    logger.info('Default patients data added successfully');
  }
}).catch((err) => {
  logger.error(err);
  logger.error('Default patients data were not added, some tests may fail');
});