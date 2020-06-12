'use strict';
/*global process, __dirname*/
const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment');
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
  app.set('trust proxy', true);
  app.use('/crux', express.static(`${__dirname}/../gui`));
  app.use('/ocrux', userRouter);
  app.use(bodyParser.json({
    limit: '10Mb',
    type: ['application/fhir+json', 'application/json+fhir', 'application/json']
  }));
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
  app.get('/ocrux/fhir/:resource?/:id?', (req, res) => {
    getResource({
      req,
      noCaching: true
    }, (resourceData, statusCode) => {
      for (const index in resourceData.link) {
        const urlArr = resourceData.link[index].url.split('fhir');
        if (urlArr.length === 2) {
          resourceData.link[index].url = '/ocrux/fhir' + urlArr[1];
        }
      }
      res.status(statusCode).json(resourceData);
    });
  });
  app.get('/fhir/:resource?/:id?', (req, res) => {
    const id = req.params.id;
    if (id === '$ihe-pix') {
      pixmRequest({
        req
      }, (resourceData, statusCode) => {
        res.status(statusCode).send(resourceData);
      });
    } else {
      getResource({
        req,
        noCaching: true
      }, (resourceData, statusCode) => {
        for (const index in resourceData.link) {
          if (!resourceData.link[index].url) {
            continue;
          }
          const urlArr = resourceData.link[index].url.split('fhir');
          if (urlArr.length === 2) {
            resourceData.link[index].url = '/fhir' + urlArr[1];
          }
        }
        res.status(statusCode).json(resourceData);
      });
    }
  });

  app.get('/ocrux/getURI', (req, res) => {
    return res.status(200).json(config.get('systems'));
  });

  app.get('/ocrux/getClients', (req, res) => {
    return res.status(200).json(config.get('clients'));
  });

  function getResource({
    req,
    noCaching
  }, callback) {
    const resource = req.params.resource;
    const id = req.params.id;
    let url = URI(config.get('fhirServer:baseURL'));
    if (resource) {
      url = url.segment(resource);
    }
    if (id) {
      url = url.segment(id);
    }
    for (const param in req.query) {
      url.addQuery(param, req.query[param]);
    }
    url = url.toString();
    fhirWrapper.getResource({
      url,
      noCaching
    }, (resourceData, statusCode) => {
      return callback(resourceData, statusCode);
    });
  }

  function pixmRequest({
    req
  }, callback) {
    const {
      sourceIdentifier,
      targetSystem,
      ...otherQueries
    } = req.query;
    const outcome = {
      "resourceType": "OperationOutcome",
      "issue": []
    };
    if (Object.keys(otherQueries).length > 0) {
      const unknownQueries = [];
      for (const qr in otherQueries) {
        unknownQueries.push(qr);
      }
      outcome.issue.push({
        "severity": "error",
        "code": "processing",
        "diagnostics": "Unknown search parameter '" + unknownQueries.join('&') + "'. Value search parameters for this search are: [sourceIdentifier, targetSystem]"
      });
    }
    if (!sourceIdentifier) {
      outcome.issue.push({
        "severity": "error",
        "code": "processing",
        "diagnostics": "Missing search parameter 'sourceIdentifier'"
      });
    } else {
      const srcId = sourceIdentifier.split('|');
      if (srcId.length !== 2) {
        outcome.issue.push({
          "severity": "error",
          "code": "processing",
          "diagnostics": "Invalid value for parameter 'sourceIdentifier', the value must include both the Patient Identity Domain (i.e., Assigning Authority) and the identifier value, separated by a '|' i.e nationalid|123."
        });
      }
    }
    if (outcome.issue.length > 0) {
      return callback(outcome);
    }
    const query = `identifier=${sourceIdentifier}&_include:recurse=Patient:link`;
    fhirWrapper.getResource({
      resource: 'Patient',
      query
    }, (resourceData, statusCode) => {
      const parameters = {
        resourceType: 'Parameters',
        parameter: []
      };
      if (resourceData.entry && resourceData.entry.length > 0) {
        for (const entry of resourceData.entry) {
          const isGoldenRec = entry.resource.meta.tag && entry.resource.meta.tag.find((tag) => {
            return tag.code === config.get('codes:goldenRecord');
          });
          if (isGoldenRec) {
            continue;
          }
          for (const identifier of entry.resource.identifier) {
            if (targetSystem) {
              if (targetSystem === identifier.system) {
                const parameter = populateId(identifier);
                parameters.parameter.push(parameter);
              }
            } else {
              const parameter = populateId(identifier);
              parameters.parameter.push(parameter);
            }
          }
        }
      }
      return callback(parameters, statusCode);
    });

    const populateId = (identifier) => {
      const parameter = {};
      parameter.name = 'targetIdentifier';
      parameter.valueIdentifier = {};
      if (identifier.system) {
        parameter.valueIdentifier.system = identifier.system;
      }
      if (identifier.value) {
        parameter.valueIdentifier.value = identifier.value;
      }
      return parameter;
    };
  }

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
    addPatient(clientID, patientsBundle, (err, response, operationSummary) => {
      const auditBundle = createAddPatientAudEvent(operationSummary, req);
      fhirWrapper.saveResource({
        resourceData: auditBundle
      }, () => {
        logger.info('Audit saved successfully');
        if (err) {
          res.status(500).send();
        } else {
          res.setHeader('location', response.entry[0].response.location);
          res.status(201).send();
        }
      });
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
    addPatient(clientID, patientsBundle, (err, response, operationSummary) => {
      if (err) {
        return res.status(500).send();
      }
      res.status(201).json(response);
    });
  });

  function createAddPatientAudEvent(operationSummary, req) {
    const auditBundle = {};
    auditBundle.type = 'batch';
    auditBundle.resourceType = 'Bundle';
    auditBundle.entry = [];
    for (const operSummary of operationSummary) {
      let action;
      if (operSummary.action === 'create') {
        action = 'C';
      } else if (operSummary.action === 'update') {
        action = 'U';
      }
      const ipAddress = req.ip.split(':').pop();
      const auditEvent = {
        id: uuid4(),
        resourceType: 'AuditEvent',
        type: {
          system: 'http://dicom.nema.org/resources/ontology/DCM',
          code: '110110'
        },
        subtype: {
          system: 'http://hl7.org/fhir/restful-interaction',
          code: operSummary.action,
        },
        action,
        recorded: moment().format("YYYY-MM-DDThh:mm:ss.SSSZ"),
        agent: [{
          requestor: true,
          network: {
            address: ipAddress,
            type: '2'
          }
        }],
        source: {
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
            code: '4'
          }
        }
      };
      if (operSummary.outcome) {
        auditEvent.outcome = operSummary.outcome;
        auditEvent.outcomeDesc = operSummary.outcomeDesc;
      } else {
        auditEvent.outcome = '0';
        auditEvent.outcomeDesc = 'Success';
      }
      auditEvent.entity = [];
      if (operSummary.cruid && operSummary.cruid.length > 0) {
        for (const cruid of operSummary.cruid) {
          auditEvent.entity.push({
            name: 'CRUID',
            what: {
              reference: cruid
            }
          });
        }
      }
      if (operSummary.FHIRMatches && operSummary.FHIRMatches.length > 0) {
        for (const match of operSummary.FHIRMatches) {
          auditEvent.entity.push({
            name: 'match',
            what: {
              reference: match.resource.resourceType + '/' + match.resource.id
            }
          });
        }
      }

      if (operSummary.submittedResource) {
        const submRes = {
          name: 'submittedResource',
          what: {
            reference: operSummary.submittedResource.resourceType + '/' + operSummary.submittedResource.id
          },
          detail: [{
            type: 'resource',
            valueString: JSON.stringify(operSummary.submittedResource)
          }]
        };
        if (operSummary.ESMatches && Array.isArray(operSummary.ESMatches)) {
          for (const esmatch of operSummary.ESMatches) {
            let match = {
              rule: esmatch.rule,
              match: esmatch.results,
              query: esmatch.query
            };
            match = JSON.stringify(match);
            submRes.detail.push({
              type: 'match',
              valueBase64Binary: Buffer.from(match).toString('base64')
            });
          }
        }
        auditEvent.entity.push(submRes);
      }
      auditBundle.entry.push({
        resource: auditEvent,
        request: {
          method: 'PUT',
          url: `AuditEvent/${auditEvent.id}`,
        }
      });
    }
    return auditBundle;
  }

  function addPatient(clientID, patientsBundle, callback) {
    const responseBundle = {
      resourceType: 'Bundle',
      entry: []
    };
    const operationSummary = [];
    if (!clientID) {
      const operSummary = {};
      operSummary.outcome = '4';
      operSummary.outcomeDesc = 'Request didnt include POS/client ID';
      operationSummary.push(operSummary);
      logger.error('No client ID found, cant add patient');
      return callback(true, responseBundle, operationSummary);
    }
    let clientName = '';
    let clients = config.get('clients');
    let clientDetails = clients.find((client) => {
      return client.id === clientID;
    });
    if (clientDetails) {
      clientName = clientDetails.displayName;
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
      bundle,
      operSummary
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
      }, (err, matches, ESMatches, matchedGoldenRecords) => {
        if (err) {
          operSummary.outcome = '8';
          operSummary.outcomeDesc = 'An error occured while finding matches';
          return callback(err, responseBundle, operationSummary);
        }
        operSummary.ESMatches = ESMatches;
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
                    operSummary.outcome = '8';
                    operSummary.outcomeDesc = 'An error occured while saving patient and golden record';
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
              operSummary.cruid.push(goldenRecord.resourceType + '/' + goldenRecord.id);
              return callback();
            }).catch((err) => {
              if (!operSummary.outcome) {
                operSummary.outcome = '8';
                operSummary.outcomeDesc = 'Unknown Error Occured';
              }
              return callback(err);
            });
          });
        } else if (matches.entry && matches.entry.length > 0) {
          const links = getLinksFromResources(matches);
          if (links.length === 0) {
            operSummary.outcome = '8';
            operSummary.outcomeDesc = 'Matched resource(s) dont have CRUID';
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
              operSummary.outcome = '8';
              operSummary.outcomeDesc = 'Wasnt able to build queries for fetching CRUID in the database';
              logger.error('Cant build query from resource id');
              return callback(true);
            }
            if (!matchedGoldenRecords || !matchedGoldenRecords.entry || matchedGoldenRecords.entry.length === 0) {
              operSummary.outcome = '8';
              operSummary.outcomeDesc = 'Querying for CRUID details from FHIR Server returned nothing';
              return callback(true);
            }
            if (currentLinks.length > 0) {
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
                  const inNewMatches = matchedGoldenRecords.entry.find((entry) => {
                    return entry.resource.id === currentLink.resource.id;
                  });
                  if (!inNewMatches) {
                    replacedByNewGolden = true;
                  }
                }
                for (const index in currentLink.resource.link) {
                  if (currentLink.resource.link[index].other.reference === 'Patient/' + patient.id) {
                    // remove patient from golden link
                    if (replacedByNewGolden) {
                      currentLink.resource.link[index].other.reference = 'Patient/' + matchedGoldenRecords.entry[0].resource.id;
                      currentLink.resource.link[index].type = 'replaced-by';
                    } else {
                      currentLink.resource.link.splice(index, 1);
                    }
                    // remove golden link from patient
                    for (const index in patient.link) {
                      if (patient.link[index].other.reference === 'Patient/' + currentLink.resource.id) {
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
            for (const goldenRecord of matchedGoldenRecords.entry) {
              operSummary.cruid.push(goldenRecord.resource.resourceType + '/' + goldenRecord.resource.id);
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
            operSummary.FHIRMatches = matches.entry;
            operSummary.ESMatches = ESMatches;
            return callback();
          }
        } else {
          operSummary.outcome = '8';
          operSummary.outcomeDesc = 'Invalid response returned when attempted to get matches';
          logger.error('Invalid response returned when attempted to get matches');
          return callback(true);
        }
      });
    };

    logger.info('Searching to check if the patient exists');
    async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
      const operSummary = {};
      operSummary.cruid = [];
      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = [];

      // Tag this patient with an ID of the system that submitted
      const tagExist = newPatient.resource.meta && newPatient.resource.meta.tag && newPatient.resource.meta.tag.find((tag) => {
        return tag.system === URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
      });
      if (!tagExist) {
        if (!newPatient.resource.meta) {
          newPatient.resource.meta = {
            tag: []
          };
        }
        if (!newPatient.resource.meta.tag) {
          newPatient.resource.meta.tag = [];
        }
        newPatient.resource.meta.tag.push({
          system: URI(config.get("systems:CRBaseURI")).segment('clientid').toString(),
          code: clientID,
          display: clientName
        });
      }
      const internalIdURI = config.get("systems:internalid:uri");
      if (!internalIdURI || internalIdURI.length === 0) {
        operSummary.outcome = '8';
        operSummary.outcomeDesc = 'URI for internal id is not defined on configuration files';
        logger.error('URI for internal id is not defined on configuration files, stop processing patient');
        operationSummary.push(operSummary);
        return nxtPatient();
      }

      const validSystem = newPatient.resource.identifier && newPatient.resource.identifier.find(identifier => {
        return internalIdURI.includes(identifier.system) && identifier.value;
      });
      if (!validSystem) {
        operSummary.outcome = '4';
        operSummary.outcomeDesc = 'Patient resource has no identifier for internalid registered by client registry';
        operationSummary.push(operSummary);
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
          operSummary.action = 'create';
          delete newPatient.resource.link;
          newPatient.resource.id = uuid4();
          operSummary.submittedResource = newPatient.resource;
          findMatches({
            patient: newPatient.resource,
            newPatient: true,
            bundle,
            operSummary
          }, (err) => {
            if (err) {
              operationSummary.push(operSummary);
              return nxtPatient();
            }
            fhirWrapper.saveResource({
              resourceData: bundle,
            }, (err) => {
              if (err) {
                operSummary.outcome = '8';
                operSummary.outcomeDesc = 'An error occured while saving a bundle that contians matches of a submitted resource and the submitted resource itself';
                operationSummary.push(operSummary);
                return nxtPatient();
              }
              operSummary.what = newPatient.resource.resourceType + '/' + newPatient.resource.id;
              if (config.get("matching:tool") === "elasticsearch") {
                cacheFHIR.fhir2ES({
                  "patientsBundle": bundle
                }, (err) => {
                  if (err) {
                    operSummary.outcome = '8';
                    operSummary.outcomeDesc = 'An error has occured while caching patient changes into elasticsearch';
                  }
                  operationSummary.push(operSummary);
                  return nxtPatient();
                });
              } else {
                operationSummary.push(operSummary);
                return nxtPatient();
              }
            });
          });
        } else if (existingPatients.length > 0) {
          operSummary.action = 'update';
          let existingLinks = [];
          const existingPatient = existingPatients[0];
          operSummary.submittedResource = existingPatient.resource;
          operSummary.what = existingPatient.resource.resourceType + '/' + existingPatient.resource.id;
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
              bundle,
              operSummary
            }, (err) => {
              if (err) {
                operationSummary.push(operSummary);
                return nxtPatient();
              }
              fhirWrapper.saveResource({
                resourceData: bundle,
              }, () => {
                if (config.get("matching:tool") === "elasticsearch") {
                  cacheFHIR.fhir2ES({
                    "patientsBundle": bundle
                  }, (err) => {
                    if (err) {
                      logger.error('An error has occured while caching patient changes into elasticsearch');
                      operSummary.outcome = '8';
                      operSummary.outcomeDesc = 'An error has occured while caching patient changes into elasticsearch';
                    }
                    operationSummary.push(operSummary);
                    return nxtPatient();
                  });
                } else {
                  operationSummary.push(operSummary);
                  return nxtPatient();
                }
              });
            });
          });
        }
      });
    }, () => {
      if (responseBundle.entry.length === 0) {
        logger.error('An error has occured while adding patient');
        return callback(true, responseBundle, operationSummary);
      }
      logger.info('Done adding patient');
      return callback(false, responseBundle, operationSummary);
    });
  }

  app.post('/ocrux/unBreakMatch', (req, res) => {
    const operationSummary = [];
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
    const auditBundle = {};
    auditBundle.type = 'batch';
    auditBundle.resourceType = 'Bundle';
    auditBundle.entry = [];

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
        const operSummary = {
          unBreakResources: []
        };
        if (idPair.id1) {
          const idArr1 = idPair.id1.toString().split('/');
          const [resourceName1, resourceId1] = idArr1;
          if (resourceName1 && resourceId1) {
            operSummary.editingResource = resourceName1 + '/' + resourceId1;
            operSummary.outcome = '4';
            operSummary.outcomeDesc = 'Missing ID2';
          } else {
            operSummary.editingResource = idPair.id1.toString();
            operSummary.outcome = '4';
            operSummary.outcomeDesc = 'Wrong ID Format';
          }
        }
        if (idPair.id2) {
          const idArr2 = idPair.id2.toString().split('/');
          const [resourceName2, resourceId2] = idArr2;
          if (resourceName2 && resourceId2) {
            operSummary.unBreakResources.push(resourceName2 + '/' + resourceId2);
            operSummary.outcome = '4';
            operSummary.outcomeDesc = 'Missing ID1';
          } else {
            operSummary.unBreakResources.push(idPair.id2.toString());
            operSummary.outcome = '4';
            operSummary.outcomeDesc = 'Wrong ID Format';
          }
        }
        operationSummary.push(operSummary);
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
    if (dontSaveChanges) {
      createAuditEvent();
      fhirWrapper.saveResource({
        resourceData: auditBundle
      }, () => {
        return res.status(400).json({
          resourceType: "OperationOutcome",
          issue: [{
            severity: "error",
            code: "processing",
            diagnostics: "Invalid request"
          }]
        });
      });
    }
    if (query && !dontSaveChanges) {
      fhirWrapper.getResource({
        resource: 'Patient',
        query,
        noCaching: true
      }, (resourceData) => {
        const auditedId = [];
        for (const idPair of ids) {
          const id1 = idPair.id1;
          const id2 = idPair.id2;
          const resource1 = resourceData.entry.find((entry) => {
            return entry.resource.id === id1.split('/').pop();
          });
          const clientIdTag1 = resource1.resource.meta && resource1.resource.meta.tag && resource1.resource.meta.tag.find((tag) => {
            return tag.system === URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
          });
          const resource2 = resourceData.entry.find((entry) => {
            return entry.resource.id === id2.split('/').pop();
          });
          const clientIdTag2 = resource2.resource.meta && resource2.resource.meta.tag && resource2.resource.meta.tag.find((tag) => {
            return tag.system === URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
          });
          if (!clientIdTag1) {
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

          if (!clientIdTag2) {
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
          if (!auditedId.includes(id1)) {
            const operSummary = {
              unBreakResources: []
            };
            operSummary.editingResource = resource1.resource.resourceType + '/' + resource1.resource.id;
            operSummary.CRUID = resource2.resource.link[0].other.reference;
            if (dontSaveChanges) {
              operSummary.outcome = '8';
            }
            operSummary.unBreakResources.push(resource2.resource.resourceType + '/' + resource2.resource.id);
            operationSummary.push(operSummary);
          } else {
            for (const index in operationSummary) {
              const oper = operationSummary[index];
              if (oper.editingResource === resource1.resource.resourceType + '/' + resource1.resource.id) {
                operationSummary[index].unBreakResources.push(resource2.resource.resourceType + '/' + resource2.resource.id);
              }
            }
          }
          auditedId.push(id1);
        }
        logger.info('Saving the unbroken matches');
        if (!dontSaveChanges) {
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
                return tag.system === URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
              });
              if (clientIdTag) {
                clientID = clientIdTag.code;
              }
              if (clientID) {
                const patientsBundle = {
                  entry: [{
                    resource: entry.resource
                  }]
                };
                addPatient(clientID, patientsBundle, (err, response, operationSummary) => {
                  const tmpAuditBundle = createAddPatientAudEvent(operationSummary, req);
                  auditBundle.entry = auditBundle.entry.concat(tmpAuditBundle.entry);
                  logger.info('Done rematching ' + entry.resource.id);
                  if (err) {
                    errFound = true;
                  }
                  Object.assign(responseBundle, response);
                  return nxtEntry();
                });
              } else {
                errFound = true;
              }
            }, () => {
              createAuditEvent();
              fhirWrapper.saveResource({
                resourceData: auditBundle
              }, () => {
                if (errFound) {
                  return res.status(500).json(responseBundle);
                }
                res.status(201).json(responseBundle);
              });
            });
          });
        } else {
          createAuditEvent();
          fhirWrapper.saveResource({
            resourceData: auditBundle
          }, () => {
            return res.status(400).json({
              resourceType: "OperationOutcome",
              issue: [{
                severity: "error",
                code: "processing",
                diagnostics: "Invalid request"
              }]
            });
          });
        }
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

    function createAuditEvent() {
      const ipAddress = req.ip.split(':').pop();
      const username = req.query.username;
      for (const operSummary of operationSummary) {
        const entity = [];
        if (operSummary.editingResource) {
          entity.push({
            name: 'unBreak',
            what: {
              reference: operSummary.editingResource
            }
          });
        }
        if (operSummary.CRUID) {
          entity.push({
            name: 'unBreakFromCRUID',
            what: {
              reference: operSummary.CRUID
            }
          });
        }
        for (const unbreak of operSummary.unBreakResources) {
          entity.push({
            name: 'unBreakFromResource',
            what: {
              reference: unbreak
            }
          });
        }
        let outcome;
        let outcomeDesc;
        if (operSummary.outcome) {
          outcome = operSummary.outcome;
          outcomeDesc = operSummary.outcomeDesc;
        } else {
          outcome = '0';
          outcomeDesc = 'Success';
        }

        const id = uuid4();
        auditBundle.entry.push({
          resource: {
            id,
            resourceType: 'AuditEvent',
            type: {
              system: 'http://dicom.nema.org/resources/ontology/DCM',
              code: '110110'
            },
            subtype: {
              system: 'http://hl7.org/fhir/restful-interaction',
              code: 'update',
            },
            action: 'U',
            recorded: moment().format("YYYY-MM-DDThh:mm:ss.SSSZ"),
            agent: [{
              altId: username,
              requestor: true,
              network: {
                address: ipAddress,
                type: '2'
              }
            }],
            source: {
              type: {
                system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
                code: '4'
              }
            },
            entity,
            outcome,
            outcomeDesc
          },
          request: {
            method: 'PUT',
            url: 'AuditEvent/' + id
          }
        });
      }
      return;
    }
  });

  app.post('/ocrux/breakMatch', (req, res) => {
    const operationSummary = [];
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
          const operSummary = {
            brokenResources: []
          };
          operSummary.editingResource = entry.resource.resourceType + '/' + entry.resource.id;
          if (!entry.resource.link || (entry.resource.link && entry.resource.link.length === 0)) {
            operSummary.outcome = '8';
            operSummary.outcomeDesc = 'Submitted resource has no CRUID';
            noLink.push(entry.resource.id);
            continue;
          }
          operSummary.oldCRUID = entry.resource.link[0].other.reference;
          for (const link of entry.resource.link) {
            // group together records that shares the same golden id, these will later on be assigned to the same new golden id
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
          operationSummary.push(operSummary);
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
          // get broken links for auditing
          for (const goldenRecord of goldenRecords.entry) {
            for (const linkIndex in goldenRecord.resource.link) {
              if (!ids.includes(goldenRecord.resource.link[linkIndex].other.reference)) {
                for (const index in operationSummary) {
                  operationSummary[index].brokenResources.push(goldenRecord.resource.link[linkIndex].other.reference);
                }
              }
            }
          }

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
                for (const index in operationSummary) {
                  if (operationSummary[index].editingResource === resourceData.entry[index].resource.resourceType + '/' + resourceData.entry[index].resource.id) {
                    operationSummary[index].outcome = '8';
                    operationSummary[index].outcomeDesc = 'Golden record was not found on the database';
                  }
                }
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
                }
                saveAuditEvent(() => {
                  return res.status(400).json(respObj);
                });
              }
              if (dontSaveChanges) {
                respObj.issue.push({
                  severity: "error",
                  code: "processing",
                  diagnostics: "Internal Error"
                });
                saveAuditEvent(() => {
                  return res.status(500).json(respObj);
                });
              }
              fhirWrapper.saveResource({
                resourceData: bundle
              }, (err) => {
                if (err) {
                  for (const index in operationSummary) {
                    operationSummary[index].outcome = '8';
                    operationSummary[index].outcomeDesc = 'Error occured while saving changes';
                  }
                  saveAuditEvent(() => {
                    return res.status(500).json({
                      resourceType: "OperationOutcome",
                      issue: [{
                        severity: "error",
                        code: "processing",
                        diagnostics: "Internal Error"
                      }]
                    });
                  });
                }
                saveAuditEvent(() => {
                  res.status(200).send();
                });
              });
            });
          } else {
            for (const index in operationSummary) {
              operationSummary[index].outcome = '8';
              operationSummary[index].outcomeDesc = 'Links to records were not found';
            }
            saveAuditEvent(() => {
              return res.status(500).json({
                resourceType: "OperationOutcome",
                issue: [{
                  severity: "error",
                  code: "processing",
                  diagnostics: "Links to records were not found"
                }]
              });
            });
          }
        });
      });
    } else {
      saveAuditEvent(() => {
        return res.status(400).json({
          resourceType: "OperationOutcome",
          issue: [{
            severity: "error",
            code: "processing",
            diagnostics: "Invalid ID Format. example valid ID is Patient/1"
          }]
        });
      });
    }

    const saveAuditEvent = (callback) => {
      logger.info('saving audit event');
      const ipAddress = req.ip.split(':').pop();
      const username = req.query.username;
      const auditBundle = {};
      auditBundle.type = 'batch';
      auditBundle.resourceType = 'Bundle';
      auditBundle.entry = [];
      for (const operSummary of operationSummary) {
        const entity = [];
        if (operSummary.editingResource) {
          entity.push({
            name: 'break',
            what: {
              reference: operSummary.editingResource
            }
          });
        }
        if (operSummary.oldCRUID) {
          entity.push({
            name: 'oldCRUID',
            what: {
              reference: operSummary.oldCRUID
            }
          });
        }
        for (const broken of operSummary.brokenResources) {
          entity.push({
            name: 'breakFrom',
            what: {
              reference: broken
            }
          });
        }
        let outcome;
        let outcomeDesc;
        if (operSummary.outcome) {
          outcome = operSummary.outcome;
          outcomeDesc = operSummary.outcomeDesc;
        } else {
          outcome = '0';
          outcomeDesc = 'Success';
        }
        const id = uuid4();
        auditBundle.entry.push({
          resource: {
            id,
            resourceType: 'AuditEvent',
            type: {
              system: 'http://dicom.nema.org/resources/ontology/DCM',
              code: '110110'
            },
            subtype: {
              system: 'http://hl7.org/fhir/restful-interaction',
              code: 'update',
            },
            action: 'U',
            recorded: moment().format("YYYY-MM-DDThh:mm:ss.SSSZ"),
            agent: [{
              altId: username,
              requestor: true,
              network: {
                address: ipAddress,
                type: '2'
              }
            }],
            source: {
              type: {
                system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
                code: '4'
              }
            },
            entity,
            outcome,
            outcomeDesc
          },
          request: {
            method: 'PUT',
            url: 'AuditEvent/' + id
          }
        });
      }
      if (auditBundle.entry.length > 0) {
        fhirWrapper.saveResource({
          resourceData: auditBundle
        }, () => {
          logger.info('Audit event saved successfully');
          return callback();
        });
      } else {
        return callback();
      }
    };
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
          prerequisites.init((err) => {
            if (err) {
              process.exit();
            }
            if (config.get("matching:tool") === "elasticsearch") {
              const runsLastSync = config.get("sync:lastFHIR2ESSync");
              cacheFHIR.fhir2ES({
                lastSync: runsLastSync
              }, (err) => {});
            }
          });
          const app = appRoutes();
          const server = app.listen(config.get('app:port'), () => {
            const configEmitter = medUtils.activateHeartbeat(config.get('mediator:api'));
            configEmitter.on('config', newConfig => {
              logger.info('Received updated config:', newConfig);
              const updatedConfig = Object.assign(configFile, newConfig);
              reloadConfig(updatedConfig, () => {
                prerequisites.init((err) => {
                  if (err) {
                    process.exit();
                  }
                  if (config.get("matching:tool") === "elasticsearch") {
                    const runsLastSync = config.get("sync:lastFHIR2ESSync");
                    cacheFHIR.fhir2ES({
                      lastSync: runsLastSync
                    }, (err) => {});
                  }
                });
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
      prerequisites.init((err) => {
        if (err) {
          process.exit();
        }
        if (config.get("matching:tool") === "elasticsearch") {
          const runsLastSync = config.get("sync:lastFHIR2ESSync");
          cacheFHIR.fhir2ES({
            lastSync: runsLastSync
          }, (err) => {});
        }
      });
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