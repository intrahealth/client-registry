const async = require('async');
const fs = require('fs');
const request = require('request');

const logger = require('../server/lib/winston');
let patient1 = require('./patient1_openmrs.json')
let patient2 = require('./patient2_dhis2.json')
let patient3 = require('./patient3_lims.json')
let patient4 = require('./patient4_lims.json')

let bundle = {
  entry: []
}
bundle.entry = bundle.entry.concat(patient1.entry)
bundle.entry = bundle.entry.concat(patient2.entry)
bundle.entry = bundle.entry.concat(patient3.entry)
bundle.entry = bundle.entry.concat(patient4.entry)

async.eachSeries(bundle.entry, (entry, nxtEntry) => {
  logger.info('sending patient id ' + JSON.stringify(entry.resource.identifier,0,2));
  let agentOptions = {
    cert: fs.readFileSync(
      '../server/sampleclientcertificates/openmrs_cert.pem'
    ),
    key: fs.readFileSync(
      '../server/sampleclientcertificates/openmrs_key.pem'
    ),
    ca: fs.readFileSync('../server/certificates/server_cert.pem'),
    securityOptions: 'SSL_OP_NO_SSLv3',
  }
  let auth = {
    username: 'openmrs',
    password: 'openmrs'
  }
  const options = {
    url: 'http://scratchpad.ihris.org/ocr/fhir/Patient',
    auth,
    json: entry.resource,
  };
  request.post(options, (err, res, body) => {
    logger.info(res.headers);
    return nxtEntry();
  });
}, () => {
  logger.info('Done')
});