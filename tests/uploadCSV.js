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
        let sex = row['sex'];
        let given = row['given_name'];
        let surname = row['surname'];
        let phone = row['phone_number'];
        let nationalID = row['uganda_nin'];
        let ARTNumb = row['art_number'];
        let birthDate = row['date_of_birth'];
        if (sex) {
          sex = sex.trim();
        }
        if (given) {
          given = given.trim();
        }
        if (surname) {
          surname = surname.trim();
        }
        if (phone) {
          phone = phone.trim();
        }
        if (nationalID) {
          nationalID = nationalID.trim();
        }
        if (ARTNumb) {
          ARTNumb = ARTNumb.trim();
        }
        if (birthDate) {
          birthDate = birthDate.trim();
        }
        let resource = {};
        resource.resourceType = 'Patient';
        if (sex == 'f') {
          resource.gender = 'female';
        } else if (sex == 'm') {
          resource.gender = 'male';
        }
        if ( birthDate.match( /\d{8,8}/ ) ) {
          let birthMoment = moment( birthDate );
          if ( birthMoment.isValid() ) {
            resource.birthDate = birthMoment.format("YYYY-MM-DD")
          }
        }
        resource.identifier = [
          {
            system: 'http://clientregistry.org/openmrs',
            value: row['rec_id'].trim(),
          },
        ];
        if (nationalID) {
          resource.identifier.push({
            system: 'http://system1/nationalid',
            value: nationalID,
          });
        }
        if (ARTNumb) {
          resource.identifier.push({
            system: 'http://system1/artnumber',
            value: ARTNumb,
          });
        }
        if (phone) {
          resource.telecom = [];
          resource.telecom.push({
            system: 'phone',
            value: phone,
          });
        }
        let name = {};
        if (given) {
          name.given = [given];
        }
        if (surname) {
          name.family = surname;
        }
        name.use = 'official';
        resource.name = [name];
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
                username: 'openmrs',
                password: 'openmrs'
              }
              const options = {
                url: 'http://localhost:5001/Patient',
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
