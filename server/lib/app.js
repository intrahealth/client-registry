'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const uuid4 = require('uuid/v4');
const fhirWrapper = require('./fhir')();
const matching = require('./matching')();
const logger = require('./winston');
const config = require('./config');

const app = express();
app.use(bodyParser.json());

app.post('/addPatient', (req, res) => {
  const patientsBundle = req.body;
  if (!patientsBundle) {
    logger.error('Received empty request');
    res.status(400).send('Empty request body');
    return;
  }
  if (patientsBundle.resourceType !== 'Bundle') {
    logger.error('Request is not a bundle');
    res.status(400).send('Request is not a bundle');
  }
  const addLinks = (patients, callback) => {
    async.each(patients.entry, (patient, nxtPatient) => {
      const patientEntry = {};
      patientEntry.entry = [{
        resource: patient.resource
      }];
      matching.performMatch({
        sourceResource: patient.resource
      }, matches => {
        async.series([
          (callback) => {
            // link all matches to the new patient
            const promises = [];
            for (const match of matches) {
              promises.push(new Promise((resolve, reject) => {
                fhirWrapper.linkPatients({
                  patients: patientEntry,
                  linkReference: `Patient/${match.resource.id}`
                }, () => {
                  resolve();
                });
              }));
            }
            Promise.all(promises).then(() => {
              return callback(null);
            });
          },
          (callback) => {
            // link new patient to all matches
            const matchesEntry = {};
            matchesEntry.entry = [];
            matchesEntry.entry = matchesEntry.entry.concat(matches);
            fhirWrapper.linkPatients({
              patients: matchesEntry,
              linkReference: `Patient/${patient.resource.id}`
            }, () => {
              return callback(null);
            });
          }
        ], () => {
          return nxtPatient();
        });
      });
    }, () => {
      return callback();
    });
  };
  async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
    let invalidId = true;
    const existingPatients = {};
    existingPatients.entry = [];
    const promises = [];
    for (const identifier of newPatient.resource.identifier) {
      promises.push(new Promise((resolve, reject) => {
        if (identifier.system && identifier.value) {
          invalidId = false;
          const query = `identifier=${identifier.system}|${identifier.value}`;
          fhirWrapper.getResource({
            resource: 'Patient',
            query
          }, (dbPatients) => {
            existingPatients.entry = existingPatients.entry.concat(dbPatients.entry);
            resolve();
          });
        } else {
          resolve();
        }
      }));
    }
    Promise.all(promises).then(() => {
      if (existingPatients.entry.length === 0 && !invalidId) {
        newPatient.resource.id = uuid4();
        const bundle = {};
        bundle.entry = [{
          resource: newPatient.resource,
          request: {
            method: 'PUT',
            url: `Patient/${newPatient.resource.id}`,
          }
        }];
        bundle.type = 'batch';
        bundle.resourceType = 'Bundle';
        fhirWrapper.saveResource({
          bundle
        }, () => {
          const newPatientEntry = {};
          newPatientEntry.entry = [{
            resource: newPatient.resource
          }];
          addLinks(newPatientEntry, () => {
            return nxtPatient();
          });
        });
      } else if (existingPatients.entry.length > 0) {
        /**
         * overwrite existing CR patients with this new Patient
         * all links willbe broken because new patient come without any link
         */
        const promises = [];
        for (const existingPatient of existingPatients.entry) {
          promises.push(new Promise((resolve, reject) => {
            const id = existingPatient.resource.id;
            existingPatient.resource = newPatient.resource;
            existingPatient.resource.id = id;
            const bundle = {};
            bundle.entry = [{
              resource: existingPatient.resource,
              request: {
                method: 'PUT',
                url: `Patient/${existingPatient.resource.id}`,
              }
            }];
            bundle.type = 'batch';
            bundle.resourceType = 'Bundle';
            fhirWrapper.saveResource({
              bundle
            }, () => {
              resolve();
            });
          }));
        }
        Promise.all(promises).then(() => {
          addLinks(existingPatients, () => {
            return nxtPatient();
          });
        }).catch((err) => {
          logger.error(err);
          return nxtPatient();
        });
      }
    });
  }, () => {
    res.status(200).send();
  });
});

app.listen(config.get('server:port'), () => {
  logger.info(`Server is running and listening on port: ${config.get('server:port')}`);
});
