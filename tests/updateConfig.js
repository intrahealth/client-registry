const fs = require('fs');
const async = require('async');
const path = require('path');
const request = require('request');
const uploadResults = require('./uploadResults');
const logger = require('../server/lib/winston');



const agentOptions = {
  cert: fs.readFileSync(
    '../server/clientCertificates/openmrs_cert.pem'
  ),
  key: fs.readFileSync(
    '../server/clientCertificates/openmrs_key.pem'
  ),
  ca: fs.readFileSync('../server/serverCertificates/server_cert.pem'),
  securityOptions: 'SSL_OP_NO_SSLv3',
};
const auth = {
  username: 'openmrs',
  password: 'openmrs'
};
const options = {
  url: 'https://localhost:3000/updateConfig/',
  agentOptions,
  // auth,
  json: [
    { "systems:internalid:uri": ["http://openmrs.org/openmrs2", "http://dhis2.org/internalid"] }
  ],
};
request.post(options, (err, res, body) => {
  if(err) {
    logger.error(err);
  }
  logger.info(body)
});
