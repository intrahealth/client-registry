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

const bundle = {
  entry: []
};
if (patients.entry) {
  bundle.entry = bundle.entry.concat(patients.entry);
} else if (patients.resourceType === 'Patient') {
  bundle.entry.push({
    resource: patients
  });
} else {
  logger.error('Invalid data submitted, aborting submission');
  process.exit();
}
console.time('Total Processing Time');
async.eachOfSeries(bundle.entry, (entry, index, nxtEntry) => {
  console.time('Processing Took');
  console.log('Processing ' + ++index + ' of ' + bundle.entry.length);
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
    url: 'https://localhost:3000/fhir/' + entry.resource.resourceType,
    agentOptions,
    // auth,
    json: entry.resource,
  };
  request.post(options, (err, res, body) => {
    if (err) {
      logger.error('An error has occured');
      logger.error(err);
      return nxtEntry();
    }
    if (!res.headers) {
      logger.error('Something went wrong, this transaction was not successfully, please cross check the URL and authentication details');
      return nxtEntry();
    }
    if (res.headers.location) {
      logger.info({
        'Patient ID': res.headers.location,
        'Patient CRUID': res.headers.locationcruid
      });
    } else {
      logger.error('Something went wrong, no CRUID created');
    }
    console.timeEnd('Processing Took');
    return nxtEntry();
  });
}, () => {
  console.timeEnd('Total Processing Time');
  if (csvTrueLinks) {
    uploadResults.uploadResults(csvTrueLinks);
  } else {
    console.log(
      'True links were not specified then upload results wont be displayed'
    );
  }
});
