const fs = require('fs');
const async = require('async');
const path = require('path');
const request = require('request');
const uploadResults = require('./uploadResults');
const logger = require('../server/lib/winston');

if (!process.argv[2]) {
  logger.error('Please specify path to a JSON file');
  process.exit();
}
const jsonFile = process.argv[2];
let csvTrueLinks = '';
if (process.argv[3]) {
  csvTrueLinks = process.argv[3];
}

try {
  if (!fs.existsSync(jsonFile)) {
    logger.error(`Cant find file ${jsonFile}`);
    process.exit();
  }
  if (!fs.existsSync(csvTrueLinks)) {
    csvTrueLinks = '';
  }
} catch (err) {
  logger.error(err);
  process.exit();
}

const ext = path.extname(jsonFile);
const extTrueLinks = path.extname(csvTrueLinks);
if (ext !== '.json') {
  logger.error('File is not a JSON');
  process.exit();
}
if (extTrueLinks !== '.csv') {
  csvTrueLinks = '';
}

const patients = require(jsonFile);

logger.info('Upload started ...');


console.time('Total Processing Time');
console.time('Processing Took');
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
  url: 'https://localhost:3000/fhir',
  agentOptions,
  json: patients
};
request.post(options, (err, res, body) => {
  if(res.headers.location) {
    logger.info({
      'Patient ID': res.headers.location,
      'Patient CRUID': res.headers.locationcruid
    });
  } else {
    logger.error('Something went wrong, no CRUID created');
  }
  if (err) {
    logger.error('An error has occured');
    logger.error(err);
    return nxtEntry();
  }
  console.timeEnd('Processing Took');

  console.timeEnd('Total Processing Time');
  if (csvTrueLinks) {
    uploadResults.uploadResults(csvTrueLinks);
  } else {
    console.log(
      'True links were not specified then upload results wont be displayed'
    );
  }
});
