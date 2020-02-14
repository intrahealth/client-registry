'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const uuid4 = require('uuid/v4');
const prerequisites = require('./prerequisites');
const medUtils = require('openhim-mediator-utils');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const URI = require('urijs');
const https = require('https');
const fhirWrapper = require('./fhir')();
const medMatching = require('./medMatching')();
const esMatching = require('./esMatching');
const cacheFHIR = require('./tools/cacheFHIR');
const mixin = require('./mixin');
const logger = require('./winston');
const config = require('./config');
const mediatorConfig = require(`${__dirname}/../config/mediator`);

var userRouter = require('./user');

const serverOpts = {
  key: fs.readFileSync(`${__dirname}/../certificates/server_key.pem`),
  cert: fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`),
  requestCert: true,
  rejectUnauthorized: false,
  ca: [fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`)]
};

if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();
  app.use('/ocrux', userRouter);
  app.use(bodyParser.json());
  const jwtValidator = function (req, res, next) {
    if (!req.path.startsWith('/ocrux')) {
      return next();
    }
    if (req.method == 'OPTIONS' ||
      req.path == '/ocrux/authenticate' ||
      req.path == '/' ||
      req.path.startsWith('/ocrux/static/js') ||
      req.path.startsWith('/ocrux/static/config.json') ||
      req.path.startsWith('/ocrux/static/css') ||
      req.path.startsWith('/ocrux/static/img') ||
      req.path.startsWith('/ocrux/favicon.ico')
    ) {
      return next();
    }
    if (!req.headers.authorization || req.headers.authorization.split(' ').length !== 2) {
      logger.error('Token is missing');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('WWW-Authenticate', 'Bearer realm="Token is required"');
      res.set('charset', 'utf - 8');
      res.status(401).json({
        error: 'Token is missing',
      });
    } else {
      const tokenArray = req.headers.authorization.split(' ');
      const token = req.headers.authorization = tokenArray[1];
      jwt.verify(token, config.get('auth:secret'), (err, decoded) => {
        if (err) {
          logger.warn('Token expired');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('WWW-Authenticate', 'Bearer realm="Token expired"');
          res.set('charset', 'utf - 8');
          res.status(401).json({
            error: 'Token expired',
          });
        } else {
          if (req.path == '/ocrux/isTokenActive/') {
            res.set('Access-Control-Allow-Origin', '*');
            res.status(200).send(true);
          } else {
            return next();
          }
        }
      });
    }
  };

  function certificateValidity(req, res, next) {
    if (req.path.startsWith('/ocrux')) {
      return next();
    }
    const cert = req.connection.getPeerCertificate();
    if (req.client.authorized) {
      if (!cert.subject.CN) {
        logger.error(`Client has submitted a valid certificate but missing Common Name (CN)`);
        return res.status(400).send(`You have submitted a valid certificate but missing Common Name (CN)`);
      }
    } else if (cert.subject) {
      logger.error(`Client ${cert.subject.CN} has submitted an invalid certificate`);
      return res.status(403).send(`Sorry you have submitted an invalid certificate, make sure that your certificate is signed by client registry`);
    } else {
      logger.error('Client has submitted request without certificate');
      return res.status(401).send(`Sorry, but you need to provide a client certificate to continue.`);
    }
    next();
  }
  if (!config.get('mediator:register')) {
    app.use(certificateValidity);
  }
  app.use(jwtValidator);

  app.get('/ocrux/fhir/:resource?', (req, res) => {
    const resource = req.params.resource;
    let url = URI(config.get('fhirServer:baseURL'));
    if (resource) {
      url = url.segment(resource);
    }
    for (const param in req.query) {
      url.addQuery(param, req.query[param]);
    }
    url = url.toString();
    fhirWrapper.getResource({
      url
    }, (resourceData) => {
      const baseURL = URI(config.get('fhirServer:baseURL')).toString().replace('/fhir', '');
      for (const index in resourceData.link) {
        resourceData.link[index].url = resourceData.link[index].url.replace(baseURL, '');
        resourceData.link[index].url = '/ocrux' + resourceData.link[index].url;
      }
      res.status(200).json(resourceData);
    });
  });

  app.post('/Patient', (req, res) => {
    logger.info('Received a request to add new patient');
    const patient = req.body;
    if (!patient.resourceType ||
      (patient.resourceType && patient.resourceType !== 'Patient') ||
      !patient.identifier ||
      (patient.identifier && patient.identifier.length === 0)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid patient resource submitted"
        }]
      });
    }
    const patientsBundle = {
      entry: [{
        resource: patient
      }]
    };
    let clientID;
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid'];
    } else {
      const cert = req.connection.getPeerCertificate();
      clientID = cert.subject.CN;
    }
    addPatient(clientID, patientsBundle, 'Patient', req, res);
  });

  app.post('/', (req, res) => {
    logger.info('Received a request to add new patients from a bundle');
    const patientsBundle = req.body;
    if (!patientsBundle.resourceType ||
      (patientsBundle.resourceType && patientsBundle.resourceType !== 'Bundle') ||
      !patientsBundle.entry || (patientsBundle.entry && patientsBundle.entry.length === 0)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid bundle submitted"
        }]
      });
    }
    let clientID;
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid'];
    } else {
      const cert = req.connection.getPeerCertificate();
      clientID = cert.subject.CN;
    }
    addPatient(clientID, patientsBundle, 'Bundle', req, res);
  });

  function addPatient(clientID, patientsBundle, type, req, res) {
    const responseBundle = {
      resourceType: 'Bundle',
      entry: []
    };

    const addLinks = (patient, goldenRecord) => {
      if (!patient.link || !Array.isArray(patient.link)) {
        patient.link = [];
      }
      let linkExist = patient.link.find((link) => {
        return link.other.reference === 'Patient/' + goldenRecord.id;
      });
      if (!linkExist) {
        patient.link.push({
          other: {
            reference: 'Patient/' + goldenRecord.id
          },
          type: 'refer'
        });
      }

      if (!goldenRecord.link || !Array.isArray(goldenRecord.link)) {
        goldenRecord.link = [];
      }
      linkExist = goldenRecord.link.find((link) => {
        return link.other.reference === 'Patient/' + patient.id;
      });
      if (!linkExist) {
        goldenRecord.link.push({
          other: {
            reference: 'Patient/' + patient.id
          },
          type: 'seealso'
        });
      }
    };

    const getLinksFromResources = (resourceBundle) => {
      const links = [];
      for (const entry of resourceBundle.entry) {
        if (entry.resource.link && entry.resource.link.length > 0) {
          for (const link of entry.resource.link) {
            const exist = links.find((pushedLink) => {
              return pushedLink === link.other.reference;
            });
            if (!exist) {
              links.push(link.other.reference);
            }
          }
        }
      }
      return links;
    };

    const findMatches = ({
      patient,
      currentLinks = [],
      newPatient = true,
      bundle
    }, callback) => {
      const patientEntry = {};
      patientEntry.entry = [{
        resource: patient,
      }];
      let matchingTool;
      if (config.get("matching:tool") === "mediator") {
        matchingTool = medMatching;
      } else if (config.get("matching:tool") === "elasticsearch") {
        matchingTool = esMatching;
      }
      matchingTool.performMatch({
        sourceResource: patient,
        ignoreList: [patient.id],
      }, matches => {
        if (matches.entry && matches.entry.length === 0) {
          let goldenRecord;
          // check if this patient had a golden record and that golden record has one link which is this patient, then reuse
          const existLinkPromise = new Promise((resolve) => {
            if (currentLinks.length > 0) {
              for (const entry of currentLinks) {
                const exist = entry.resource.link.find((link) => {
                  return link.other.reference === 'Patient/' + patient.id;
                });
                if (entry.resource.link && entry.resource.link.length === 1 && exist) {
                  goldenRecord = entry.resource;
                }
              }
              resolve();
            } else {
              resolve();
            }
          });
          existLinkPromise.then(() => {
            if (!goldenRecord) {
              goldenRecord = fhirWrapper.createGoldenRecord();
            }
            responseBundle.entry.push({
              response: {
                location: goldenRecord.resourceType + '/' + goldenRecord.id
              }
            });
            // if both patient and golden record doesnt exist then add them to avoid error when adding links
            const promise = new Promise((resolve, reject) => {
              if (newPatient) {
                let tmpBundle = {};
                tmpBundle.type = 'batch';
                tmpBundle.resourceType = 'Bundle';
                tmpBundle.entry = [{
                  resource: patient,
                  request: {
                    method: 'PUT',
                    url: `Patient/${patient.id}`,
                  },
                }, {
                  resource: goldenRecord,
                  request: {
                    method: 'PUT',
                    url: `Patient/${goldenRecord.id}`,
                  },
                }];
                fhirWrapper.saveResource({
                  resourceData: tmpBundle
                }, (err, body) => {
                  if (err) {
                    return reject();
                  }
                  return resolve();
                });
                tmpBundle = {};
              } else {
                resolve();
              }
            });
            promise.then((res, err) => {
              if (err) {
                // this is an error, find a way to handle it
                logger.error('An error occured while saving patient and golden record');
              }
              addLinks(patient, goldenRecord);
              const patientResource = {
                resource: patient,
                request: {
                  method: 'PUT',
                  url: `Patient/${patient.id}`,
                },
              };
              const goldenRecordResource = {
                resource: goldenRecord,
                request: {
                  method: 'PUT',
                  url: `Patient/${goldenRecord.id}`,
                },
              };
              bundle.entry.push(goldenRecordResource);
              bundle.entry.push(patientResource);
              return callback();
            });
          });
        } else if (matches.entry && matches.entry.length > 0) {
          const links = getLinksFromResources(matches);
          if (links.length === 0) {
            // this is an error, find a way to handle it
            return callback();
          } else {
            let query;
            for (const link of links) {
              const linkArr = link.split('/');
              const [resourceName, id] = linkArr;
              if (query) {
                query += ',' + id;
              } else {
                query = '_id=' + id;
              }
            }
            if (!query) {
              // this is an error, find a way to handle it
              return callback();
            }
            fhirWrapper.getResource({
              resource: 'Patient',
              query
            }, (goldenRecords) => {
              for (const goldenRecord of goldenRecords.entry) {
                responseBundle.entry.push({
                  response: {
                    location: goldenRecord.resource.resourceType + '/' + goldenRecord.resource.id
                  }
                });
                addLinks(patient, goldenRecord.resource);
                bundle.entry.push({
                  resource: patient,
                  request: {
                    method: 'PUT',
                    url: `Patient/${patient.id}`,
                  },
                }, {
                  resource: goldenRecord.resource,
                  request: {
                    method: 'PUT',
                    url: `Patient/${goldenRecord.resource.id}`,
                  },
                });
              }
              return callback();
            });
          }
        } else {
          // this is an error, find a way to handle it
          return callback(true);
        }
      });
    };

    logger.info('Searching to check if the patient exists');
    async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = [];
      const validSystem = newPatient.resource.identifier && newPatient.resource.identifier.find(identifier => {
        const uri = config.get("systems:" + clientID + ":uri");
        return identifier.system === uri;
      });
      if (!validSystem) {
        logger.error('Patient resource has no identifiers registered by client registry, stop processing');
        return nxtPatient();
      }

      const query = `identifier=${validSystem.system}|${validSystem.value}&_include=Patient:link`;
      fhirWrapper.getResource({
        resource: 'Patient',
        query,
      }, patientData => {
        const goldenRecords = patientData.entry.filter((entry) => {
          return entry.search.mode === 'include';
        });
        const existingPatients = patientData.entry.filter((entry) => {
          return entry.search.mode === 'match';
        });
        if (existingPatients.length === 0) {
          newPatient.resource.id = uuid4();
          findMatches({
            patient: newPatient.resource,
            newPatient: true,
            bundle
          }, (err) => {
            fhirWrapper.saveResource({
              resourceData: bundle,
            }, () => {
              if (config.get("matching:tool") === "elasticsearch") {
                cacheFHIR.fhir2ES({
                  "patientsBundle": bundle
                }, (err) => {
                  return nxtPatient();
                });
              } else {
                return nxtPatient();
              }
            });
          });
        } else if (existingPatients.length > 0) {
          let existingLinks = [];
          const existingPatient = existingPatients[0];
          logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} exists, updating database records`);
          async.series([
            /**
             * overwrite with this new Patient all existing CR patients who has same identifier as the new patient
             * This will also break all links, links will be added after matching is done again due to updates
             */
            callback => {
              const id = existingPatient.resource.id;
              if (goldenRecords.length > 0) {
                existingLinks = _.cloneDeep(goldenRecords);
              }
              existingPatient.resource = Object.assign({}, newPatient.resource);
              existingPatient.resource.id = id;
              bundle.entry.push({
                resource: existingPatient.resource,
                request: {
                  method: 'PUT',
                  url: `Patient/${existingPatient.resource.id}`,
                },
              });
              return callback(null);
            },
            /**
             * Drop links to every CR patient who is linked to this new patient
             */
            callback => {
              const link = `Patient/${existingPatient.resource.id}`;
              for (const goldenRecord of goldenRecords) {
                for (const index in goldenRecord.resource.link) {
                  if (goldenRecord.resource.link[index].other.reference === link) {
                    goldenRecord.resource.link.splice(index, 1);
                    bundle.entry.push({
                      resource: goldenRecord.resource,
                      request: {
                        method: 'PUT',
                        url: `Patient/${goldenRecord.resource.id}`,
                      },
                    });
                  }
                }
              }
              return callback(null);
            },
          ], () => {
            findMatches({
              patient: existingPatient.resource,
              currentLinks: existingLinks,
              newPatient: false,
              bundle
            }, () => {
              fhirWrapper.saveResource({
                resourceData: bundle,
              }, () => {
                if (config.get("matching:tool") === "elasticsearch") {
                  cacheFHIR.fhir2ES({
                    "patientsBundle": bundle
                  }, (err) => {
                    return nxtPatient();
                  });
                } else {
                  return nxtPatient();
                }
              });
            });
          });
        }
      });
    }, () => {
      logger.info('Done adding patient');
      if (type != 'Bundle') {
        res.setHeader('location', responseBundle.entry[0].response.location);
        res.status(201).send();
      } else {
        res.status(201).json(responseBundle);
      }
    });
  };

  app.post('/ocrux/unBreakMatch', (req, res) => {
    const ids = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Expected an array of IDs"
        }]
      });
    }
    const bundle = {};
    bundle.type = 'batch';
    bundle.resourceType = 'Bundle';
    bundle.entry = [];
    const notProcessed = [];
    const noLink = [];
    const dontSaveChanges = false;
    let query;
    const goldenIds = [];
    for (const idPair of ids) {
      if (!idPair.id1 || !idPair.id2) {
        dontSaveChanges = true;
        continue;
      }
      const idArr1 = idPair.id1.toString().split('/');
      const idArr2 = idPair.id2.toString().split('/');
      const [resourceName1, resourceId1] = idArr1;
      const [resourceName2, resourceId2] = idArr2;
      if (!resourceName1 || !resourceId1 || !resourceName2 || !resourceId2) {
        notProcessed.push(idPair);
        dontSaveChanges = true;
        continue;
      }
      if (query) {
        query += ',' + idPair.id1 + ',' + idPair.id2;
      } else {
        query = '_id=' + idPair.id1 + ',' + idPair.id2;
      }
    }
    if (query && !dontSaveChanges) {
      fhirWrapper.getResource({
        resource: 'Patient',
        query
      }, (resourceData) => {
        for (const idPair of ids) {
          const id1 = idPair.id1;
          const id2 = idPair.id2;
          const resource1 = resourceData.entry.find((entry) => {
            return entry.resource.id === id1.split('/').pop();
          });
          if (resource1 && resource1.resource.extension) {
            for (const index in resource1.resource.extension) {
              const ext = resource1.resource.extension[index];
              if (ext.valueReference.reference === id2) {
                resource1.resource.extension.splice(index, 1);
                bundle.entry.push({
                  resource: resource1.resource,
                  request: {
                    method: "PUT",
                    url: resource1.resource.resourceType + '/' + resource1.resource.id
                  }
                });
              }
            }
          }

          const resource2 = resourceData.entry.find((entry) => {
            return entry.resource.id === id2.split('/').pop();
          });
          if (resource2 && resource2.resource.extension) {
            for (const index in resource2.resource.extension) {
              const ext = resource2.resource.extension[index];
              if (ext.valueReference.reference === id1) {
                resource2.resource.extension.splice(index, 1);
                bundle.entry.push({
                  resource: resource2.resource,
                  request: {
                    method: "PUT",
                    url: resource2.resource.resourceType + '/' + resource2.resource.id
                  }
                });
              }
            }
          }
        }
        fhirWrapper.saveResource({
          resourceData: bundle
        }, (err) => {
          if (err) {
            return res.status(500).json({
              resourceType: "OperationOutcome",
              issue: [{
                severity: "error",
                code: "processing",
                diagnostics: "Internal Error"
              }]
            });
          }
          for (const entry of bundle.entry) {
            let clientID;
            for (const identifier of entry.resource.identifier) {
              clientID = getClientIDBySystem(identifier.system);
              if (clientID) {
                break;
              }
            }
            if (clientID) {
              const patientsBundle = {
                entry: [{
                  resource: entry.resource
                }]
              };
              addPatient(clientID, patientsBundle, 'Patient', req, res);
            }
          }
          res.status(200).send();
        });
      });;
    } else {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid request"
        }]
      });
    }

    function getClientIDBySystem(system) {
      if (!system) {
        return;
      }
      const systems = config.get("systems");
      for (const clientID in systems) {
        if (systems[clientID].uri === system) {
          return clientID;
        }
      }
      return;
    }
  });

  app.post('/ocrux/breakMatch', (req, res) => {
    const ids = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Expected an array of IDs"
        }]
      });
    }
    const bundle = {};
    bundle.type = 'batch';
    bundle.resourceType = 'Bundle';
    bundle.entry = [];
    const notProcessed = [];
    const noLink = [];
    let dontSaveChanges = false;
    let query;
    const goldenIds = [];
    for (const id of ids) {
      const idArr = id.toString().split('/');
      const [resourceName, resourceId] = idArr;
      if (!resourceName || !resourceId) {
        notProcessed.push(id);
        continue;
      }
      if (query) {
        query += ',' + id;
      } else {
        query = '_id=' + id;
      }
    }
    if (query) {
      fhirWrapper.getResource({
        resource: 'Patient',
        query
      }, (resourceData) => {
        const goldenRec2RecoLink = {};
        for (const entry of resourceData.entry) {
          if (!entry.resource.link || (entry.resource.link && entry.resource.link.length === 0)) {
            noLink.push(entry.resource.id);
            continue;
          }
          for (const link of entry.resource.link) {
            // group together records that shares the same golden id, these will later on be assigned to the same new golden olden
            if (!goldenRec2RecoLink.hasOwnProperty(link.other.reference)) {
              const newGoldenRecord = fhirWrapper.createGoldenRecord();
              newGoldenRecord.link = [];
              bundle.entry.push({
                resource: newGoldenRecord,
                request: {
                  method: "PUT",
                  url: newGoldenRecord.resourceType + '/' + newGoldenRecord.id
                }
              });
              goldenRec2RecoLink[link.other.reference] = {
                recordId: [],
                newGoldenRecordId: newGoldenRecord.id
              };
            }

            // add this resource as a link into this new golden record
            for (const bundleIndex in bundle.entry) {
              if (bundle.entry[bundleIndex].resource.id === goldenRec2RecoLink[link.other.reference].newGoldenRecordId) {
                bundle.entry[bundleIndex].resource.link.push({
                  other: {
                    reference: 'Patient/' + entry.resource.id
                  },
                  type: "seealso"
                });
              }
            }
            goldenRec2RecoLink[link.other.reference].recordId.push(entry.resource.id);
            const exist = goldenIds.find((id) => {
              return id === link.other.reference;
            });
            if (!exist) {
              goldenIds.push(link.other.reference);
            }
          }
        }
        let goldenQuery;
        for (const goldenId of goldenIds) {
          const goldenIdArr = goldenId.split('/');
          const [resName, resId] = goldenIdArr;
          if (goldenQuery) {
            goldenQuery += ',' + resId;
          } else {
            goldenQuery = '_id=' + resId;
          }
        }
        fhirWrapper.getResource({
          resource: 'Patient',
          query: goldenQuery
        }, (goldenRecords) => {
          let linkedRecordsQuery;
          for (const index in resourceData.entry) {
            resourceData.entry[index].request = {
              method: "PUT",
              url: resourceData.entry[index].resource.resourceType + "/" + resourceData.entry[index].resource.id
            };
            // remove this resource as a link to current golden record
            for (const goldenRecord of goldenRecords.entry) {
              for (const linkIndex in goldenRecord.resource.link) {
                if (goldenRecord.resource.link[linkIndex].other.reference === 'Patient/' + resourceData.entry[index].resource.id) {
                  goldenRecord.resource.link.splice(linkIndex, 1);
                  // mark this golden record as it already exist into the DB, this is to differentiate with new golden records
                  goldenRecord.resource.fromDB = true;
                  bundle.entry.push({
                    resource: {
                      ...goldenRecord.resource
                    },
                    request: {
                      method: "PUT",
                      url: goldenRecord.resource.resourceType + '/' + goldenRecord.resource.id
                    }
                  });
                }
              }
            }
            for (const linkToGold of resourceData.entry[index].resource.link) {
              const linkToGoldId = linkToGold.other.reference;
              const goldenRecord = goldenRecords.entry.find((entry) => {
                return 'Patient/' + entry.resource.id === linkToGoldId;
              });
              if (!goldenRecord) {
                dontSaveChanges = true;
                continue;
              }
              for (const linkedRec of goldenRecord.resource.link) {
                const linkedRecArr = linkedRec.other.reference.split('/');
                const [resName, resId] = linkedRecArr;
                if (linkedRecordsQuery) {
                  linkedRecordsQuery += ',' + resId;
                } else {
                  linkedRecordsQuery = '_id=' + resId;
                }
              }
              for (const linkedRec of goldenRecord.resource.link) {
                const shareSameGolden = goldenRec2RecoLink['Patient/' + goldenRecord.resource.id].recordId.find((mappedLink) => {
                  return 'Patient/' + mappedLink === linkedRec.other.reference;
                });
                if (!shareSameGolden) {
                  if (!resourceData.entry[index].resource.extension) {
                    resourceData.entry[index].resource.extension = [];
                  }
                  const extExist = resourceData.entry[index].resource.extension.find((extension) => {
                    return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === linkedRec.other.reference;
                  });
                  if (!extExist) {
                    resourceData.entry[index].resource.extension.push({
                      url: config.get("systems:brokenMatch:uri"),
                      valueReference: {
                        reference: linkedRec.other.reference
                      }
                    });
                  }
                }
              }
            }
            if (resourceData.entry[index].resource.link.length > 1) {
              /**
               * if a patient had links to multiple uuid, then try to realocate to a new link that has many records
               */
              let goldenRecordToUse;
              let totalLinks = 0;
              for (const linkToGold of resourceData.entry[index].resource.link) {
                let newGoldenRecord = goldenRec2RecoLink[linkToGold.other.reference].newGoldenRecordId;
                newGoldenRecord = 'Patient/' + newGoldenRecord;
                if (!goldenRecordToUse) {
                  goldenRecordToUse = newGoldenRecord;
                  totalLinks = goldenRec2RecoLink[linkToGold.other.reference].recordId.length;
                } else {
                  if (goldenRec2RecoLink[linkToGold.other.reference].recordId.length > totalLinks) {
                    goldenRecordToUse = newGoldenRecord;
                    totalLinks = goldenRec2RecoLink[linkToGold.other.reference].recordId.length;
                  }
                }
              }
              resourceData.entry[index].resource.link = [{
                other: {
                  reference: goldenRecordToUse
                }
              }];
            } else {
              const linkToGoldId = resourceData.entry[index].resource.link[0].other.reference;
              const newGoldenRecord = goldenRec2RecoLink[linkToGoldId].newGoldenRecordId;
              resourceData.entry[index].resource.link = [{
                other: {
                  reference: 'Patient/' + newGoldenRecord
                }
              }];
            }
          }
          // check if there is any unused golden record and remove it from the bundle
          for (const entryIndex in bundle.entry) {
            const entry = bundle.entry[entryIndex];
            const fromDB = entry.resource.meta.tag.find((tag) => {
              return tag.code === config.get('codes:goldenRecord') && entry.resource.fromDB;
            });
            if (fromDB) {
              delete bundle.entry[entryIndex].resource.fromDB;
              continue;
            }
            const isGoldenRec = entry.resource.meta.tag.find((tag) => {
              return tag.code === config.get('codes:goldenRecord');
            });
            if (!isGoldenRec) {
              continue;
            }
            let exist = false;
            for (const resEntry of resourceData.entry) {
              const found = resEntry.resource.link.find((link) => {
                return link.other.reference === 'Patient/' + entry.resource.id;
              });
              exist = found;
            }
            if (!exist) {
              bundle.entry.splice(entryIndex, 1);
            }
          }
          if (linkedRecordsQuery) {
            fhirWrapper.getResource({
              resource: 'Patient',
              query: linkedRecordsQuery
            }, (linkedRecordsData) => {
              for (const linkedRecord of linkedRecordsData.entry) {
                const partOfRequest = resourceData.entry.find((entry) => {
                  return entry.resource.id === linkedRecord.resource.id;
                });
                if (partOfRequest) {
                  continue;
                }
                for (const index in resourceData.entry) {
                  const youBrokeMe = resourceData.entry[index].resource.extension && resourceData.entry[index].resource.extension.find((extension) => {
                    return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === 'Patient/' + linkedRecord.resource.id;
                  });
                  if (youBrokeMe) {
                    if (!linkedRecord.resource.extension) {
                      linkedRecord.resource.extension = [];
                    }
                    const extExist = linkedRecord.resource.extension.find((extension) => {
                      return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === 'Patient/' + resourceData.entry[index].resource.id;
                    });
                    if (!extExist) {
                      linkedRecord.resource.extension.push({
                        url: config.get("systems:brokenMatch:uri"),
                        valueReference: {
                          reference: 'Patient/' + resourceData.entry[index].resource.id
                        }
                      });
                      bundle.entry.push({
                        resource: linkedRecord.resource,
                        request: {
                          method: "PUT",
                          url: linkedRecord.resource.resourceType + '/' + linkedRecord.resource.id
                        }
                      });
                    }
                  }
                }
              }
              bundle.entry = bundle.entry.concat(resourceData.entry);
              const respObj = {
                resourceType: "OperationOutcome",
                issue: []
              };
              if (noLink.length > 0 || notProcessed.length > 0) {
                if (noLink.length > 0) {
                  respObj.issue.push({
                    severity: "error",
                    code: "processing",
                    diagnostics: "Attempting to break link for " + noLink.join(', ') + " but no link found"
                  });
                }
                if (notProcessed.length > 0) {
                  respObj.issue.push({
                    severity: "error",
                    code: "processing",
                    diagnostics: "Invalid ID format submitted for " + notProcessed.join(', ') + " but no link found"
                  });
                };
                return res.status(400).json(respObj);
              }
              if (dontSaveChanges) {
                respObj.issue.push({
                  severity: "error",
                  code: "processing",
                  diagnostics: "Internal Error"
                });
                return res.status(500).json(respObj);
              }
              fhirWrapper.saveResource({
                resourceData: bundle
              }, (err) => {
                if (err) {
                  return res.status(500).json({
                    resourceType: "OperationOutcome",
                    issue: [{
                      severity: "error",
                      code: "processing",
                      diagnostics: "Internal Error"
                    }]
                  });
                }
                res.status(200).send();
              });
            });
          } else {
            res.status(500).json({
              resourceType: "OperationOutcome",
              issue: [{
                severity: "error",
                code: "processing",
                diagnostics: "Links to records were not found"
              }]
            });
          }
        });
      });
    } else {
      res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid ID Format. example valid ID is Patient/1"
        }]
      });
    }
  });

  app.get('/breakMatchDel', (req, res) => {
    const id1 = req.query.id1;
    const id2 = req.query.id2;
    const promises = [];
    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id1
      }, (resourceData) => {
        resolve(resourceData);
      });
    }));

    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id2
      }, (resourceData) => {
        resolve(resourceData);
      });
    }));

    Promise.all(promises).then((resourcesData) => {
      const resourceData1 = resourcesData[0];
      const resourceData2 = resourcesData[1];
      if (!Array.isArray(resourceData1.link) || !Array.isArray(resourceData2.link)) {
        return res.status(500).send();
      }
      let matchBroken = false;
      const id1Reference = resourceData1.resourceType + '/' + resourceData1.id;
      const id2Reference = resourceData2.resourceType + '/' + resourceData2.id;
      for (const linkIndex in resourceData1.link) {
        if (resourceData1.link[linkIndex].other.reference === id2Reference) {
          resourceData1.link.splice(linkIndex, 1);
          matchBroken = true;
        }
      }

      for (const linkIndex in resourceData2.link) {
        if (resourceData2.link[linkIndex].other.reference === resourceData1.resourceType + '/' + resourceData1.id) {
          resourceData2.link.splice(linkIndex, 1);
          matchBroken = true;
        }
      }

      if (matchBroken) {
        if (!resourceData1.meta.extension) {
          resourceData1.meta.extension = [];
        }
        const extExist1 = resourceData1.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id2Reference;
        });
        if (!extExist1) {
          resourceData1.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id2Reference
            }
          });
        }

        if (!resourceData2.meta.extension) {
          resourceData2.meta.extension = [];
        }
        const extExist2 = resourceData2.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id1Reference;
        });
        if (!extExist2) {
          resourceData2.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id1Reference
            }
          });
        }
      }

      const bundle = {};
      bundle.entry = [];
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry.push({
        resource: resourceData1,
        request: {
          method: 'PUT',
          url: id1Reference
        }
      }, {
        resource: resourceData2,
        request: {
          method: 'PUT',
          url: id2Reference
        }
      });

      fhirWrapper.saveResource({
        resourceData: bundle
      }, (err, body) => {
        if (err) {
          res.status(500).send();
        } else {
          res.status(200).send();
        }
      });

    });
  });
  return app;
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function reloadConfig(data, callback) {
  const tmpFile = `${__dirname}/../config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), err => {
    if (err) {
      throw err;
    }
    config.file(tmpFile);
    return callback();
  });
}

function start(callback) {
  if (config.get("matching:tool") === "elasticsearch" && config.get('app:installed')) {
    const runsLastSync = config.get("sync:lastFHIR2ESSync");
    cacheFHIR.fhir2ES({
      lastSync: runsLastSync
    }, (err) => {});
  }
  if (config.get('mediator:register')) {
    logger.info('Running client registry as a mediator');
    medUtils.registerMediator(config.get('mediator:api'), mediatorConfig, err => {
      if (err) {
        logger.error('Failed to register this mediator, check your config');
        logger.error(err.stack);
        process.exit(1);
      }
      config.set('mediator:api:urn', mediatorConfig.urn);
      medUtils.fetchConfig(config.get('mediator:api'), (err, newConfig) => {
        if (err) {
          logger.info('Failed to fetch initial config');
          logger.info(err.stack);
          process.exit(1);
        }
        const env = process.env.NODE_ENV || 'development';
        const configFile = require(`${__dirname}/../config/config_${env}.json`);
        const updatedConfig = Object.assign(configFile, newConfig);
        reloadConfig(updatedConfig, () => {
          config.set('mediator:api:urn', mediatorConfig.urn);
          logger.info('Received initial config:', newConfig);
          logger.info('Successfully registered mediator!');
          if (!config.get('app:installed')) {
            prerequisites.loadResources((err) => {
              if (!err) {
                mixin.updateConfigFile(['app', 'installed'], true, () => {});
              }
              if (config.get("matching:tool") === "elasticsearch") {
                const runsLastSync = config.get("sync:lastFHIR2ESSync");
                cacheFHIR.fhir2ES({
                  lastSync: runsLastSync
                }, (err) => {});
              }
            });
          }
          const app = appRoutes();
          const server = app.listen(config.get('app:port'), () => {
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));
            configEmitter.on('config', newConfig => {
              logger.info('Received updated config:', newConfig);
              const updatedConfig = Object.assign(configFile, newConfig);
              reloadConfig(updatedConfig, () => {
                if (!config.get('app:installed')) {
                  prerequisites.loadResources((err) => {
                    if (!err) {
                      mixin.updateConfigFile(['app', 'installed'], true, () => {});
                    }
                  });
                }
                config.set('mediator:api:urn', mediatorConfig.urn);
              });
            });
            callback(server);
          });
        });
      });
    });
  } else {
    logger.info('Running client registry as a stand alone');
    const app = appRoutes();
    const server = https.createServer(serverOpts, app).listen(config.get('app:port'), () => {
      if (!config.get('app:installed')) {
        prerequisites.loadResources((err) => {
          if (!err) {
            mixin.updateConfigFile(['app', 'installed'], true, () => {});
          }
          if (config.get("matching:tool") === "elasticsearch") {
            const runsLastSync = config.get("sync:lastFHIR2ESSync");
            cacheFHIR.fhir2ES({
              lastSync: runsLastSync
            }, (err) => {});
          }
        });
      }
      callback(server);
    });
  }
}

exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  start(() =>
    logger.info(`Server is running and listening on port: ${config.get('app:port')}`)
  );
}