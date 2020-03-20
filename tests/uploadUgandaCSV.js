const fs = require('fs');
const async = require('async');
const csv = require('fast-csv');
const path = require('path');
const request = require('request');
const moment = require('moment');
const uploadResults = require('./uploadResults');
const logger = require('../server/lib/winston');

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
let counter = 1000;
fs.createReadStream(path.resolve(__dirname, '', csvFile))
  .pipe(
    csv.parse({
      headers: true,
    })
  )
  .on('error', error => console.error(error))
  .on('data', row => {
    promises.push(
      new Promise((resolve, reject) => {
        let sex = row['gender'];
        let dob = row['dob'];
        let uniqueID = row['Unique ID'];
        let ARTNumb = row['art_number'];
        let dhis2FacId = row['dhis2_uid'];
        if (sex && sex.trim() === 'M') {
          sex = 'male'
        } else if (sex && sex.trim() === 'F') {
          sex = 'female'
        } else {
          sex = 'unknown'
        }
        if (dob) {
          dob = dob.trim();
          dob = moment(dob, 'DD-MMM-YYYY').format('YYYY-MM-DD')
        }
        if (uniqueID) {
          uniqueID = uniqueID.trim();
        }
        if (ARTNumb) {
          ARTNumb = ARTNumb.trim();
        }
        if (dhis2FacId) {
          dhis2FacId = dhis2FacId.trim();
        }
        counter++
        let resource = {};
        resource.resourceType = 'Patient';
        resource.gender = sex;
        resource.identifier = [
          {
            system: 'http://health.go.ug/cr/internalid',
            value: counter,
          },
        ];
        if (uniqueID) {
          resource.identifier.push({
            system: 'http://health.go.ug/cr/uniqueid',
            value: uniqueID,
          });
        }
        if (ARTNumb) {
          resource.identifier.push({
            system: 'http://health.go.ug/cr/artnumber',
            value: ARTNumb,
          });
        }
        if (dhis2FacId) {
          resource.identifier.push({
            system: 'http://health.go.ug/cr/dhis2facid',
            value: dhis2FacId,
          });
        }
        if (dob) {
          resource.birthDate = dob;
        }
        bundle.entry.push({
          resource,
        });
        if (bundle.entry.length === 250) {
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
      bundles.push(bundle);
    }
    Promise.all(promises).then(() => {
      async.eachSeries(
        bundles,
        (bundle, nxt) => {
          async.eachSeries(
            bundle.entry,
            (entry, nxtEntry) => {
              console.log(
                'sending a bundle of ' + bundle.entry.length + ' resources'
              );
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
                username: 'lims',
                password: '4dpCe5MCve'
              }
              const options = {
                url: 'http://216.104.201.68/ocr/fhir/Patient',
                auth,
                json: entry.resource,
              };
              request.post(options, (err, res, body) => {
                logger.info(res.headers);
                return nxtEntry();
              });
            },
            () => {
              return nxt();
            }
          );
        },
        () => {
          if (csvTrueLinks) {
            uploadResults.uploadResults(csvTrueLinks);
          } else {
            console.log(
              'True links were not specified then upload results wont be displayed'
            );
          }
        }
      );
    });
  });
