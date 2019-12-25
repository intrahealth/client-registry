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
  logger.info('Received a request to add new patient');
  const patientsBundle = req.body;
  if (!patientsBundle) {
    logger.error('Received empty request');
    res.status(400).send('Empty request body');
    return;
  }
  if (patientsBundle.resourceType !== 'Bundle') {
    logger.error('Request is not a bundle');
    res.status(400).send('Request is not a bundle');
    return;
  }
  const addLinks = (patients, callback) => {
    /**
     * this needs to be processed in series
     * Dont change it to parallel unless you know what you are doing
     * Parallel processing may overwrite links of the new patient if new patient is a match of another new patient in the patients array
     */
    async.eachSeries(patients.entry, (patient, nxtPatient) => {
      const patientEntry = {};
      patientEntry.entry = [{
        resource: patient.resource
      }];
      matching.performMatch({
        sourceResource: patient.resource,
        ignoreList: [patient.resource.id]
      }, matches => {
        async.series([
          (callback) => {
            // link all matches to the new patient
            const linkReferences = [];
            for (const match of matches.entry) {
              linkReferences.push(`Patient/${match.resource.id}`);
            }
            fhirWrapper.linkPatients({
              patients: patientEntry,
              linkReferences
            }, () => {
              return callback(null);
            });
          },
          (callback) => {
            // link new patient to all matches
            fhirWrapper.linkPatients({
              patients: matches,
              linkReferences: [`Patient/${patient.resource.id}`]
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

  logger.info('Searching to check if the patient exists');
  async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
    let invalidId = true;
    const existingPatients = {};
    existingPatients.entry = [];
    const promises = [];
    for (const identifier of newPatient.resource.identifier) {
      promises.push(new Promise((resolve, reject) => {
        if (identifier.system && identifier.value) {
          invalidId = false;
          // const query = `identifier=${identifier.system}|${identifier.value}`;
          const query = `identifier=${identifier.value}`;
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
        logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} doesnt exist, adding to the database`);
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
          resourceData: bundle
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
        logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} exists, updating database records`);
        async.series([
          /**
           * overwrite with this new Patient all existing CR patients who has same identifier as the new patient
           * This will also break all links, links will be added after matching is done again due to updates
           */
          (callback) => {
            const bundle = {};
            bundle.type = 'batch';
            bundle.resourceType = 'Bundle';
            bundle.entry = [];
            for (const existingPatient of existingPatients.entry) {
              const id = existingPatient.resource.id;
              existingPatient.resource = Object.assign({}, newPatient.resource);
              existingPatient.resource.id = id;
              bundle.entry.push({
                resource: existingPatient.resource,
                request: {
                  method: 'PUT',
                  url: `Patient/${existingPatient.resource.id}`,
                }
              });
            }
            logger.info('Breaking all links of the new patient to other patients');
            fhirWrapper.saveResource({
              resourceData: bundle
            }, () => {
              callback(null);
            });
          },
          /**
           * Drop links to every CR patient who is linked to this new patient
           */
          (callback) => {
            const bundle = {};
            bundle.type = 'batch';
            bundle.resourceType = 'Bundle';
            bundle.entry = [];
            const promises = [];
            for (const existingPatient of existingPatients.entry) {
              promises.push(new Promise((resolve) => {
                const link = `Patient/${existingPatient.resource.id}`;
                const query = `link=${link}`;
                fhirWrapper.getResource({
                  resource: 'Patient',
                  query
                }, (dbLinkedPatients) => {
                  for (const linkedPatient of dbLinkedPatients.entry) {
                    for (const index in linkedPatient.resource.link) {
                      if (linkedPatient.resource.link[index].other.reference === link) {
                        linkedPatient.resource.link.splice(index, 1);
                        bundle.entry.push({
                          resource: linkedPatient.resource,
                          request: {
                            method: 'PUT',
                            url: `Patient/${linkedPatient.resource.id}`,
                          }
                        });
                      }
                    }
                  }
                  resolve();
                });
              }));
            }
            Promise.all(promises).then(() => {
              if (bundle.entry.length > 0) {
                logger.info(`Breaking ${bundle.entry.length} links of patients pointing to new patient`);
                fhirWrapper.saveResource({
                  resourceData: bundle
                }, () => {
                  return callback(null);
                });
              } else {
                return callback(null);
              }
            }).catch((err) => {
              callback(null);
              throw err;
            });
          }
        ], () => {
          addLinks(existingPatients, () => {
            return nxtPatient();
          });
        });
      }
    }).catch((err) => {
      logger.error(err);
      throw err;
    });
  }, () => {
    logger.info('Done adding patient');
    res.status(200).send('Done');
  });
});

app.listen(config.get('server:port'), () => {
  logger.info(`Server is running and listening on port: ${config.get('server:port')}`);
});
