const fs = require('fs');
const async = require('async');
const csv = require('fast-csv');
const path = require('path');
const request = require('request');
const moment = require('moment');
const uploadResults = require('./uploadResults');
const logger = require('../server/lib/winston');

function createFhirPatient (inputData) {
  const sex = inputData.sex ? inputData.sex.trim() : null;
  const given = inputData.given_name ? inputData.given_name.trim() : null;
  const surname = inputData.surname ? inputData.surname.trim() : null;
  const phone = inputData.phone_number ? inputData.phone_number.trim() : null;
  const nationalID = inputData.uganda_nin ? inputData.uganda_nin.trim() : null;
  const ARTNumb = inputData.art_number ? inputData.art_number.trim() : null;
  const birthDate = inputData.date_of_birth ? inputData.date_of_birth.trim() : null;

  const resource = {
    resourceType: "Patient",
    identifier: [
      {
        system: "http://clientregistry.org/openmrs",
        value: inputData.rec_id.trim(),
      },
    ],
  };

  if (sex == "f") {
    resource.gender = "female";
  } else if (sex == "m") {
    resource.gender = "male";
  }
  if (birthDate.match(/\d{8,8}/)) {
    let birthMoment = moment(birthDate);
    if (birthMoment.isValid()) {
      resource.birthDate = birthMoment.format("YYYY-MM-DD");
    }
  }
  if (nationalID) {
    resource.identifier.push({
      system: "http://clientregistry.org/nationalid",
      value: nationalID,
    });
  }
  if (ARTNumb) {
    resource.identifier.push({
      system: "http://clientregistry.org/artnumber",
      value: ARTNumb,
    });
  }
  if (phone) {
    resource.telecom = [];
    resource.telecom.push({
      system: "phone",
      value: phone,
    });
  }
  let aName = {};
  if (given) {
    aName.given = [given];
  }
  if (surname) {
    aName.family = surname;
  }
  aName.use = "official";
  resource.name = [aName];
  return resource
}

if (!process.argv[2]) {
  logger.error('Please specify path to a CSV file');
  process.exit();
}
const csvFile = process.argv[2];
let csvTrueLinks = '';
if (process.argv[3]) {
  csvTrueLinks = process.argv[3];
}

try {
  if (!fs.existsSync(csvFile)) {
    logger.error(`Cant find file ${csvFile}`);
    process.exit();
  }
  if (!fs.existsSync(csvTrueLinks)) {
    csvTrueLinks = '';
  }
} catch (err) {
  logger.error(err);
  process.exit();
}

const ext = path.extname(csvFile);
const extTrueLinks = path.extname(csvTrueLinks);
if (ext !== '.csv') {
  logger.error('File is not a CSV');
  process.exit();
}
if (extTrueLinks !== '.csv') {
  csvTrueLinks = '';
}

logger.info('Upload started ...');
let bundles = [];
let bundle = {};
bundle.type = 'batch';
bundle.resourceType = 'Bundle';
bundle.entry = [];
const promises = [];
let totalRecords = 0;
fs.createReadStream(path.resolve(__dirname, '', csvFile))
  .pipe(
    csv.parse({
      headers: true,
    })
  )
  .on('error', error => console.error(error))
  .on('data', row => {
    const fhirPatient = createFhirPatient(row)
    promises.push(
      new Promise((resolve, reject) => {
        bundle.entry.push({
          resource: fhirPatient,
        });
        if (bundle.entry.length === 250) {
          totalRecords += 250;
          let tmpBundle = {
            ...bundle,
          };
          bundles.push(tmpBundle);
          bundle.entry = [];
        }
        resolve();
      })
    );
  })
  .on('end', rowCount => {
    if (bundle.entry.length > 0) {
      totalRecords += bundle.entry.length
      bundles.push(bundle);
    }
    Promise.all(promises).then(() => {
      console.time('Total Processing Time');
      let count = 0;
      async.eachSeries(
        bundles,
        (bundle, nxt) => {
          async.eachSeries(
            bundle.entry,
            (entry, nxtEntry) => {
              count++;
              console.time('Processing Took')
              console.log('Processing ' + count + ' of ' + totalRecords);
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
                url: 'http://localhost:5001/Patient',
                auth,
                json: entry.resource,
              };
              request.post(options, (err, res, body) => {
                if(err) {
                  logger.error('An error has occurred');
                  logger.error(err);
                  return nxtEntry();
                }
                if(!res.headers) {
                  logger.error('Something went wrong, this transaction was not successfully, please cross check the URL and authentication details');
                  return nxtEntry()
                }
                if(res.headers.location) {
                  logger.info('Assigned CRUID ' + res.headers.location);
                } else {
                  logger.error('Something went wrong, no CRUID created');
                }
                console.timeEnd('Processing Took')
                return nxtEntry();
              });
            }, () => {
              return nxt();
            }
          );
        }, () => {
          console.timeEnd('Total Processing Time');
          if (csvTrueLinks) {
            uploadResults.uploadResults(csvTrueLinks);
          } else {
            console.log(
              'CSV File that had true matches was not specified, import summary wont be displayed'
            );
          }
        }
      );
    });
  });
