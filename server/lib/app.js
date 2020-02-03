'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const async = require('async');
const uuid4 = require('uuid/v4');
const prerequisites = require('./prerequisites');
const medUtils = require('openhim-mediator-utils');
const fs = require('fs');
const https = require('https')
const fhirWrapper = require('./fhir')();
const medMatching = require('./medMatching')();
const esMatching = require('./esMatching')
const cacheFHIR = require('./tools/cacheFHIR')
const mixin = require('./mixin');
const logger = require('./winston');
const config = require('./config');
const mediatorConfig = require(`${__dirname}/../config/mediator`);

const serverOpts = {
  key: fs.readFileSync(`${__dirname}/../certificates/server_key.pem`),
  cert: fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`),
  requestCert: true,
  rejectUnauthorized: false,
  ca: [fs.readFileSync(`${__dirname}/../certificates/server_cert.pem`)]
}

if (config.get('mediator:register')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

/**
 * @returns {express.app}
 */
function appRoutes() {
  const app = express();
  app.use(bodyParser.json());

  function certificateValidity(req, res, next) {
    const cert = req.connection.getPeerCertificate()
    if (req.client.authorized) {
      if (!cert.subject.CN) {
        logger.error(`Client has submitted a valid certificate but missing Common Name (CN)`)
        return res.status(400).send(`You have submitted a valid certificate but missing Common Name (CN)`)
      }
    } else if (cert.subject) {
      logger.error(`Client ${cert.subject.CN} has submitted an invalid certificate`)
      return res.status(403).send(`Sorry you have submitted an invalid certificate, make sure that your certificate is signed by client registry`)
    } else {
      logger.error('Client has submitted request without certificate')
      return res.status(401).send(`Sorry, but you need to provide a client certificate to continue.`)
    }
    next()
  }
  if (!config.get('mediator:register')) {
    app.use(certificateValidity)
  }

  app.post('/addPatient', (req, res) => {
    logger.info('Received a request to add new patient');
    const patientsBundle = req.body;
    let clientID
    if (config.get('mediator:register')) {
      clientID = req.headers['x-openhim-clientid']
    } else {
      const cert = req.connection.getPeerCertificate()
      clientID = cert.subject.CN
    }
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

    const addLinks_delete = (patients, linkReferences) => {
      for (const patient of patients.entry) {
        if (!patient.resource.link || !Array.isArray(patient.resource.link)) {
          patient.resource.link = [];
        }
        for (const linkReference of linkReferences) {
          const linkExist = patient.resource.link.find((link) => {
            return link.other.reference === linkReference;
          });
          if (!linkExist) {
            patient.resource.link.push({
              other: {
                reference: linkReference
              },
              type: 'seealso'
            });
          }
        }
        patient.request = {
          method: 'PUT',
          url: `Patient/${patient.resource.id}`,
        };
      }
      return patients
    }

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
    }

    const getLinksFromResources = (resourceBundle) => {
      let links = []
      for (let entry of resourceBundle.entry) {
        if (entry.resource.link && entry.resource.link.length > 0) {
          for (let link of entry.resource.link) {
            let exist = links.find((pushedLink) => {
              return pushedLink === link.other.reference
            })
            if (!exist) {
              links.push(link.other.reference)
            }
          }
        }
      }
      return links
    }

    const createGoldenRecord = () => {
      let goldenRecord = {
        id: uuid4(),
        resourceType: 'Patient',
        meta: {
          tag: [{
            code: config.get('codes:goldenRecord'),
            display: 'Golden Record'
          }]
        }
      }
      return goldenRecord
    }

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
      let matchingTool
      if (config.get("matching:tool") === "mediator") {
        matchingTool = medMatching
      } else if (config.get("matching:tool") === "elasticsearch") {
        matchingTool = esMatching
      }
      matchingTool.performMatch({
        sourceResource: patient,
        ignoreList: [patient.id],
      }, matches => {
        if (matches.entry && matches.entry.length === 0) {
          let goldenRecord
          // check if this patient had a golden record and that golden record has one link which is this patient, then reuse
          let existLinkPromise = new Promise((resolve) => {
            if (currentLinks.length > 0) {
              let query
              for (let currLink of currentLinks) {
                if (query) {
                  query += ',' + currLink.other.reference
                } else {
                  query = '_id=' + currLink.other.reference
                }
              }
              fhirWrapper.getResource({
                resource: 'Patient',
                query
              }, (currLinkRes) => {
                for (let entry of currLinkRes.entry) {
                  let exist = entry.resource.link.find((link) => {
                    return link.other.reference === 'Patient/' + patient.id
                  })
                  if (entry.resource.link && entry.resource.link.length === 1 && exist) {
                    goldenRecord = entry.resource
                  }
                }
                resolve()
              })
            } else {
              resolve()
            }
          })
          existLinkPromise.then(() => {
            if (!goldenRecord) {
              goldenRecord = createGoldenRecord()
            }
            // if both patient and golden record doesnt exist then add them to avoid error when adding links
            let promise = new Promise((resolve, reject) => {
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
                }]
                fhirWrapper.saveResource({
                  resourceData: tmpBundle
                }, (err, body) => {
                  if (err) {
                    return reject()
                  }
                  return resolve()
                })
                tmpBundle = {}
              } else {
                resolve()
              }
            })
            promise.then((res, err) => {
              if (err) {
                // this is an error, find a way to handle it
                logger.error('An error occured while saving patient and golden record')
              }
              addLinks(patient, goldenRecord)
              let patientResource = {
                resource: patient,
                request: {
                  method: 'PUT',
                  url: `Patient/${patient.id}`,
                },
              }
              let goldenRecordResource = {
                resource: goldenRecord,
                request: {
                  method: 'PUT',
                  url: `Patient/${goldenRecord.id}`,
                },
              }
              bundle.entry.push(goldenRecordResource);
              bundle.entry.push(patientResource);
              return callback()
            })
          })
        } else if (matches.entry && matches.entry.length > 0) {
          let links = getLinksFromResources(matches)
          if (links.length === 0) {
            // this is an error, find a way to handle it
            return callback()
          } else {
            const promises = []
            for (let link of links) {
              promises.push(new Promise((resolve) => {
                let linkArr = link.split('/')
                let [resourceName, id] = linkArr
                fhirWrapper.getResource({
                  resource: resourceName,
                  id
                }, (goldenRecord) => {
                  addLinks(patient, goldenRecord)
                  bundle.entry.push({
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
                  });
                  resolve()
                })
              }))
            }
            Promise.all(promises).then(() => {
              return callback()
            })
          }
        } else {
          // this is an error, find a way to handle it
          return callback()
        }
      });
    };

    logger.info('Searching to check if the patient exists');
    async.eachSeries(patientsBundle.entry, (newPatient, nxtPatient) => {
      const bundle = {};
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = []
      let validSystem = newPatient.resource.identifier && newPatient.resource.identifier.find(identifier => {
        let uri = config.get("systems:" + clientID + ":uri")
        return identifier.system === uri
      });
      if (!validSystem) {
        logger.error('Patient resource has no identifiers registered by client registry, stop processing');
        return nxtPatient();
      }

      let query = `identifier=${validSystem.system}|${validSystem.value}`;
      fhirWrapper.getResource({
        resource: 'Patient',
        query,
      }, existingPatients => {
        if (existingPatients.entry && existingPatients.entry.length === 0) {
          newPatient.resource.id = uuid4();
          findMatches({
            patient: newPatient.resource,
            newPatient: true,
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
                })
              } else {
                return nxtPatient();
              }
            })
          });
        } else if (existingPatients.entry && existingPatients.entry.length > 0) {
          let existingLinks = []
          const existingPatient = existingPatients.entry[0]
          logger.info(`Patient ${JSON.stringify(newPatient.resource.identifier)} exists, updating database records`);
          async.series([
            /**
             * overwrite with this new Patient all existing CR patients who has same identifier as the new patient
             * This will also break all links, links will be added after matching is done again due to updates
             */
            callback => {
              const id = existingPatient.resource.id;
              if (newPatient.resource.link) {
                existingLinks = [...existingPatient.resource.link]
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
              return callback(null)
            },
            /**
             * Drop links to every CR patient who is linked to this new patient
             */
            callback => {
              const link = `Patient/${existingPatient.resource.id}`;
              const query = `link=${link}`;
              fhirWrapper.getResource({
                resource: 'Patient',
                query,
              }, dbLinkedPatients => {
                for (const linkedPatient of dbLinkedPatients.entry) {
                  for (const index in linkedPatient.resource.link) {
                    if (linkedPatient.resource.link[index].other.reference === link) {
                      linkedPatient.resource.link.splice(index, 1);
                      bundle.entry.push({
                        resource: linkedPatient.resource,
                        request: {
                          method: 'PUT',
                          url: `Patient/${linkedPatient.resource.id}`,
                        },
                      });
                    }
                  }
                }
                return callback(null)
              });
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
                  })
                } else {
                  return nxtPatient();
                }
              })
            })
          });
        }
      });
    }, () => {
      logger.info('Done adding patient');
      res.status(200).send('Done');
    });
  });

  app.get('/breakMatch', (req, res) => {
    let id1 = req.query.id1
    let id2 = req.query.id2
    const promises = []
    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id1
      }, (resourceData) => {
        resolve(resourceData)
      })
    }))

    promises.push(new Promise((resolve) => {
      fhirWrapper.getResource({
        resource: 'Patient',
        id: id2
      }, (resourceData) => {
        resolve(resourceData)
      })
    }))

    Promise.all(promises).then((resourcesData) => {
      let resourceData1 = resourcesData[0]
      let resourceData2 = resourcesData[1]
      if (!Array.isArray(resourceData1.link) || !Array.isArray(resourceData2.link)) {
        return res.status(500).send()
      }
      let matchBroken = false
      let id1Reference = resourceData1.resourceType + '/' + resourceData1.id
      let id2Reference = resourceData2.resourceType + '/' + resourceData2.id
      for (let linkIndex in resourceData1.link) {
        if (resourceData1.link[linkIndex].other.reference === id2Reference) {
          resourceData1.link.splice(linkIndex, 1)
          matchBroken = true
        }
      }

      for (let linkIndex in resourceData2.link) {
        if (resourceData2.link[linkIndex].other.reference === resourceData1.resourceType + '/' + resourceData1.id) {
          resourceData2.link.splice(linkIndex, 1)
          matchBroken = true
        }
      }

      if (matchBroken) {
        if (!resourceData1.meta.extension) {
          resourceData1.meta.extension = []
        }
        let extExist1 = resourceData1.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id2Reference
        })
        if (!extExist1) {
          resourceData1.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id2Reference
            }
          })
        }

        if (!resourceData2.meta.extension) {
          resourceData2.meta.extension = []
        }
        let extExist2 = resourceData2.meta.extension.find((extension) => {
          return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === id1Reference
        })
        if (!extExist2) {
          resourceData2.meta.extension.push({
            url: config.get("systems:brokenMatch:uri"),
            valueReference: {
              reference: id1Reference
            }
          })
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
      })

      fhirWrapper.saveResource({
        resourceData: bundle
      }, (err, body) => {
        if (err) {
          res.status(500).send()
        } else {
          res.status(200).send()
        }
      })

    })
  })
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
    let runsLastSync = config.get("sync:lastFHIR2ESSync")
    cacheFHIR.fhir2ES({
      lastSync: runsLastSync
    }, (err) => {})
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
                let runsLastSync = config.get("sync:lastFHIR2ESSync")
                cacheFHIR.fhir2ES({
                  lastSync: runsLastSync
                }, (err) => {})
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
            let runsLastSync = config.get("sync:lastFHIR2ESSync")
            cacheFHIR.fhir2ES({
              lastSync: runsLastSync
            }, (err) => {})
          }
        });
      }
      callback(server)
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