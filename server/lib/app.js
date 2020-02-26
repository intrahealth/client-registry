'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
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
  app.use('/crux', express.static(`${__dirname}/../gui`));
  app.use('/ocrux', userRouter);
  app.use(bodyParser.json({limit: '10Mb', type: ['application/fhir+json', 'application/json+fhir', 'application/json']}));
  const jwtValidator = function (req, res, next) {
    if (!req.path.startsWith('/ocrux')) {
      return next();
    }
    if (req.method == 'OPTIONS' ||
      req.path == '/ocrux/authenticate'
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
    getPatient(req, true, (resourceData) => {
      for (const index in resourceData.link) {
        const urlArr = resourceData.link[index].url.split('fhir');
        if(urlArr.length === 2) {
          resourceData.link[index].url = '/ocrux/fhir' + urlArr[1];
        }
      }
      res.status(200).json(resourceData);
    });
  });
  app.get('/fhir/:resource?', (req, res) => {
    getPatient(req, true, (resourceData) => {
      for (const index in resourceData.link) {
        const urlArr = resourceData.link[index].url.split('fhir');
        if(urlArr.length === 2) {
          resourceData.link[index].url = '/fhir' + urlArr[1];
        }
      }
      res.status(200).json(resourceData);
    });
  });

  app.get('/ocrux/getURI', (req, res) => {
    return res.status(200).json(config.get('systems'));
  });

  app.get('/ocrux/getClients', (req, res) => {
    return res.status(200).json(config.get('clients'));
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
    addPatient(clientID, patientsBundle, (err, response) => {
      if(err) {
        return res.status(500).send();
      }
      res.setHeader('location', response.entry[0].response.location);
      res.status(201).send();
    });
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
    addPatient(clientID, patientsBundle, (err, response) => {
      if(err) {
        return res.status(500).send();
      }
      res.status(201).json(response);
    });
  });

  function getPatient(req, noCaching, callback) {
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
      url,
      noCaching
    }, (resourceData) => {
      return callback(resourceData);
    });
  }

  function addPatient(clientID, patientsBundle, callback) {
    const responseBundle = {
      resourceType: 'Bundle',
      entry: []
    };
    if(!clientID) {
      logger.error('No client ID found, cant add patient');
      return callback(true, responseBundle);
    }
    logger.info('Running match for system ' + clientID);

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
                    return reject('Error saving patient');
                  }
                  return resolve();
                });
                tmpBundle = {};
              } else {
                resolve();
              }
            });
            promise.then((resp, err) => {
              if (err) {
                logger.error('An error occured while saving patient and golden record');
                return callback(err);
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
            }).catch((err) => {
              return callback(err);
            });
          });
        } else if (matches.entry && matches.entry.length > 0) {
          const links = getLinksFromResources(matches);
          if (links.length === 0) {
            logger.error('No links from resource');
            return callback(true);
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
              logger.error('Cant build query from resource id');
              return callback(true);
            }
            fhirWrapper.getResource({
              resource: 'Patient',
              query,
              noCaching: true
            }, (goldenRecords) => {
              if(!goldenRecords || !goldenRecords.entry || goldenRecords.entry.length === 0) {
                return callback(true);
              }
              if(currentLinks.length > 0) {
                /**
                 * The purpose for this piece of code is to remove this patient from existing golden links
                 * if the existing golden link has just one link which is this patient, then link this golden link to new golden link of a patient
                 * otherwise just remove the patient from this exisitng golden link
                 * It also remove the exisitng golden link from the patient
                 */
                for (const currentLink of currentLinks) {
                  const exist = currentLink.resource.link && currentLink.resource.link.find((link) => {
                    return link.other.reference === 'Patient/' + patient.id;
                  });
                  let replacedByNewGolden = false;
                  if (currentLink.resource.link && currentLink.resource.link.length === 1 && exist) {
                    const inNewMatches = goldenRecords.entry.find((entry) => {
                      return entry.resource.id === currentLink.resource.id;
                    });
                    if(!inNewMatches) {
                      replacedByNewGolden = true;
                    }
                  }
                  for(const index in currentLink.resource.link) {
                    if(currentLink.resource.link[index].other.reference === 'Patient/' + patient.id) {
                      // remove patient from golden link
                      if(replacedByNewGolden) {
                        currentLink.resource.link[index].other.reference = 'Patient/' + goldenRecords.entry[0].resource.id;
                        currentLink.resource.link[index].type = 'replaced-by';
                      } else {
                        currentLink.resource.link.splice(index,1);
                      }
                      // remove golden link from patient
                      for(const index in patient.link) {
                        if(patient.link[index].other.reference === 'Patient/' + currentLink.resource.id) {
                          patient.link.splice(index, 1);
                        }
                      }
                      bundle.entry.push({
                        resource: currentLink.resource,
                        request: {
                          method: 'PUT',
                          url: `Patient/${currentLink.resource.id}`,
                        },
                      });
                    }
                  }
                }
              }
              // adding new links now to the patient
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

      // Tag this patient with an ID of the system that submitted
      const tagExist = newPatient.resource.meta && newPatient.resource.meta.tag && newPatient.resource.meta.tag.find((tag) => {
        return tag.code === 'clientid';
      });
      if(!tagExist) {
        if(!newPatient.resource.meta) {
          newPatient.resource.meta = {
            tag: []
          };
        }
        if(!newPatient.resource.meta.tag) {
          newPatient.resource.meta.tag = [];
        }
        newPatient.resource.meta.tag.push({
          code: 'clientid',
          display: clientID
        });
      }
      const internalIdURI = config.get("systems:internalid:uri");
      if(!internalIdURI || internalIdURI.length === 0) {
        logger.error('URI for internal id is not defined on configuration files, stop processing patient');
        return callback(true, responseBundle);
      }

      const validSystem = newPatient.resource.identifier && newPatient.resource.identifier.find(identifier => {
        return internalIdURI.includes(identifier.system) && identifier.value;
      });
      if (!validSystem) {
        logger.error('Patient resource has no identifier for internalid registered by client registry, stop processing');
        return nxtPatient();
      }

      const query = `identifier=${validSystem.system}|${validSystem.value}&_include=Patient:link`;
      fhirWrapper.getResource({
        resource: 'Patient',
        query,
        noCaching: true,
      }, patientData => {
        const goldenRecords = patientData.entry.filter((entry) => {
          return entry.search.mode === 'include';
        });
        const existingPatients = patientData.entry.filter((entry) => {
          return entry.search.mode === 'match';
        });
        if (existingPatients.length === 0) {
          delete newPatient.resource.link;
          newPatient.resource.id = uuid4();
          findMatches({
            patient: newPatient.resource,
            newPatient: true,
            bundle
          }, (err) => {
            if(err) {
              return callback(true, responseBundle);
            }
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
             * overwrite with this new Patient to existing CR patient who has same identifier as the new patient
             * This will also break all links, links will be added after matching is done again due to updates
             */
            callback => {
              const id = existingPatient.resource.id;
              if (goldenRecords.length > 0) {
                existingLinks = _.cloneDeep(goldenRecords);
              }
              delete newPatient.resource.link;
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
            }, (err) => {
              if(err) {
                return callback(true, responseBundle);
              }
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
      if(responseBundle.entry.length === 0) {
        logger.error('An error has occured while adding patient');
        return callback(true, responseBundle)
      }
      logger.info('Done adding patient');
      return callback(false, responseBundle);
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
    let dontSaveChanges = false;
    let query;
    const goldenIds = [];
    const clientIDTag = URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
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
        query,
        noCaching: true
      }, (resourceData) => {
        for (const idPair of ids) {
          const id1 = idPair.id1;
          const id2 = idPair.id2;
          const resource1 = resourceData.entry.find((entry) => {
            return entry.resource.id === id1.split('/').pop();
          });
          const clientIdTag1 = resource1.resource.meta && resource1.resource.meta.tag && resource1.resource.meta.tag.find((tag) => {
            return tag.code === 'clientid';
          });
          if(!clientIdTag1) {
            logger.error('Client ID tag is missing, unbreak match failed');
            dontSaveChanges = true;
          }
          if (resource1 && resource1.resource.extension) {
            for (const index in resource1.resource.extension) {
              const ext = resource1.resource.extension[index];
              if (ext.url === config.get('systems:brokenMatch:uri') && ext.valueReference && ext.valueReference.reference === id2) {
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
          const clientIdTag2 = resource2.resource.meta && resource2.resource.meta.tag && resource2.resource.meta.tag.find((tag) => {
            return tag.code === 'clientid';
          });
          if(!clientIdTag2) {
            logger.error('Client ID tag is missing, unbreak match failed');
            dontSaveChanges = true;
          }
          if (resource2 && resource2.resource.extension) {
            for (const index in resource2.resource.extension) {
              const ext = resource2.resource.extension[index];
              if (ext.url === config.get('systems:brokenMatch:uri') && ext.valueReference && ext.valueReference.reference === id1) {
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
        logger.info('Saving the unbroken matches');
        if(!dontSaveChanges) {
          fhirWrapper.saveResource({
            resourceData: bundle
          }, (err) => {
            if (err) {
              logger.error('An error has occured while saving unbroken matches');
              return res.status(500).json({
                resourceType: "OperationOutcome",
                issue: [{
                  severity: "error",
                  code: "processing",
                  diagnostics: "Internal Error"
                }]
              });
            }
            logger.info('Rerunning matches');
            const responseBundle = {};
            let errFound = false;
            async.eachSeries(bundle.entry, (entry, nxtEntry) => {
              logger.info('Rematching ' + entry.resource.id);
              let clientID;
              const clientIdTag = entry.resource.meta && entry.resource.meta.tag && entry.resource.meta.tag.find((tag) => {
                return tag.code === 'clientid';
              });
              if(clientIdTag) {
                clientID = clientIdTag.display;
              }
              if (clientID) {
                const patientsBundle = {
                  entry: [{
                    resource: entry.resource
                  }]
                };
                addPatient(clientID, patientsBundle, (err, response) => {
                  logger.info('Done rematching ' + entry.resource.id);
                  if(err) {
                    errFound = true;
                  }
                  Object.assign(responseBundle, response);
                  return nxtEntry();
                });
              } else {
                errFound = true;
              }
            }, () => {
              if(errFound) {
                return res.status(500).json(responseBundle);
              }
              res.status(201).json(responseBundle);
            });
          });
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
        query,
        noCaching: true
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
          query: goldenQuery,
          noCaching: true
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
                },
                type: 'refer'
              }];
            } else {
              const linkToGoldId = resourceData.entry[index].resource.link[0].other.reference;
              const newGoldenRecord = goldenRec2RecoLink[linkToGoldId].newGoldenRecordId;
              resourceData.entry[index].resource.link = [{
                other: {
                  reference: 'Patient/' + newGoldenRecord
                },
                type: 'refer'
              }];
            }
          }
          // check if there is any unused golden record and remove it from the bundle
          for (const entryIndex in bundle.entry) {
            const entry = bundle.entry[entryIndex];
            const fromDB = entry.resource.meta.tag && entry.resource.meta.tag.find((tag) => {
              return tag.code === config.get('codes:goldenRecord') && entry.resource.fromDB;
            });
            if (fromDB) {
              delete bundle.entry[entryIndex].resource.fromDB;
              continue;
            }
            const isGoldenRec = entry.resource.meta.tag && entry.resource.meta.tag.find((tag) => {
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
              query: linkedRecordsQuery,
              noCaching: true
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