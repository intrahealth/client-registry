'use strict';
/*global process */
const URI = require('urijs');
const async = require('async');
const uuid4 = require('uuid/v4');
const uuid5 = require('uuid/v5');
const _ = require('lodash');
const moment = require('moment');
const NodeCache = require( "node-cache" );
const crCache = new NodeCache();
const lodash = require('lodash');
const fhirWrapper = require('../fhir')();
const medMatching = require('../medMatching')();
const esMatching = require('../esMatching');
const cacheFHIR = require('../tools/cacheFHIR');
const logger = require('../winston');
const config = require('../config');
const sourceIdURI = URI("http://openclientregistry.org/fhir").segment('sourceid').toString();
const matchIssuesURI = URI("http://openclientregistry.org/fhir").segment('matchIssues').toString();
const humanAdjudURI = URI("http://openclientregistry.org/fhir").segment('humanAdjudication').toString();

function closeCSVAuditEvent(event) {
  let eventCopy = lodash.cloneDeep(event);
  event.entity = [];
  if(!event.extension) {
    event.extension = [];
  }
  if(Array.isArray(eventCopy.extension)) {
    for(let extInd in eventCopy.extension) {
      if(eventCopy.extension[extInd].url === 'http://openclientregistry.org/fhir/extension/csvauditreport' ) {
        eventCopy.extension.splice(extInd, 1);
        break;
      }
    }
  }
  eventCopy.id = uuid4();
  event.extension.push({
    url: 'http://openclientregistry.org/fhir/extension/csvauditreport',
    valueReference: {
      reference: `AuditEvent/${eventCopy.id}`
    }
  });
  let bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: [{
      resource: event,
      request: {
        method: 'PUT',
        url: `AuditEvent/${event.id}`
      }
    }, {
      resource: eventCopy,
      request: {
        method: 'PUT',
        url: `AuditEvent/${eventCopy.id}`
      }
    }]
  };
  fhirWrapper.saveResource({
    resourceData: bundle
  }, () => {});
}
function createCSVUploadAudEvent(operSummary, auditBundle, req) {
  let processing = crCache.get(`processingCSVReport_${operSummary.csvCode}`);
  let saving = crCache.get(`savingCSVReport_${operSummary.csvCode}`);
  if(processing || saving) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        createCSVUploadAudEvent(operSummary, auditBundle, req).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });
      }, 3000);
    });
  } else {
    crCache.set(`processingCSVReport_${operSummary.csvCode}`, true);
    return new Promise((resolve, reject) => {
      if(!operSummary.csvCode) {
        crCache.del(`processingCSVReport_${operSummary.csvCode}`);
        return reject();
      }
      if(!operSummary.submittedResource) {
        crCache.del(`processingCSVReport_${operSummary.csvCode}`);
        return reject();
      }

      //populate scores of automatches
      for(let autoIndex in operSummary.FHIRAutoMatches) {
        for(let esmatch of operSummary.ESMatches) {
          for(let esauto of esmatch.autoMatchResults) {
            if(esauto._id === operSummary.FHIRAutoMatches[autoIndex].resource.id) {
              operSummary.FHIRAutoMatches[autoIndex].score = esauto._score;
              operSummary.FHIRAutoMatches[autoIndex].threshold = esmatch.rule.autoMatchThreshold;
            }
          }
        }
      }

      //populate scores of potential matches
      for(let autoIndex in operSummary.FHIRPotentialMatches) {
        for(let esmatch of operSummary.ESMatches) {
          for(let esauto of esmatch.potentialMatchResults) {
            if(esauto._id === operSummary.FHIRPotentialMatches[autoIndex].resource.id) {
              operSummary.FHIRPotentialMatches[autoIndex].score = esauto._score;
              operSummary.FHIRPotentialMatches[autoIndex].threshold = esmatch.rule.potentialMatchThreshold;
            }
          }
        }
      }
      let matches = {
        autoMatches: operSummary.FHIRAutoMatches,
        potentialMatches: operSummary.FHIRPotentialMatches,
        FHIRConflictsMatches: operSummary.FHIRConflictsMatches
      };
      let event;
      let eventIndexInBundle;
      async.series([
        (callback) => {
          eventIndexInBundle = auditBundle.entry.findIndex((entry) => {
            return entry.resource.id === uuid5(operSummary.csvCode.toString(), '00b3ffab-450c-4407-9e59-05034a271da7');
          });
          if(eventIndexInBundle !== -1) {
            event = auditBundle.entry[eventIndexInBundle].resource;
          }
          return callback(null);
        },
        (callback) => {
          if(event) {
            return callback(null);
          }
          event = crCache.get(`csvreport_${operSummary.csvCode}`);
          if(event) {
            try {
              event = JSON.parse(event);
            } catch (error) {
              logger.error(error);
            }
          }
          return callback(null);
        },
        (callback) => {
          if(event) {
            return callback(null);
          }
          fhirWrapper.getResource({
            resource: 'AuditEvent',
            id: uuid5(operSummary.csvCode.toString(), '00b3ffab-450c-4407-9e59-05034a271da7'),
            noCaching: true
          }, (audit) => {
            if(audit && audit.resourceType !== 'OperationOutcome') {
              event = audit;
            }
            return callback(null);
          });
        }
      ], () => {
        if(!event) {
          event = {
            id: uuid5(operSummary.csvCode.toString(), '00b3ffab-450c-4407-9e59-05034a271da7'),
            resourceType: 'AuditEvent',
            meta: {
              tag: [{
                system : 'http://openclientregistry.org/tag/csv',
                code: operSummary.csvCode,
                display: 'CSV Upload'
              }]
            },
            recorded: moment().format("YYYY-MM-DDThh:mm:ss.SSSZ"),
            agent: [{
              requestor: true,
              network: {
                address: req.ip.split(':').pop(),
                type: '2'
              }
            }],
            source: {
              type: {
                system: 'http://terminology.hl7.org/CodeSystem/security-source-type',
                code: '4'
              }
            },
            entity: [{
              what: {
                reference: `${operSummary.submittedResource.resourceType}/${operSummary.submittedResource.id}`
              },
              name: 'submittedResource',
              detail: [{
                type: 'submittedPatient',
                valueString: JSON.stringify(operSummary.submittedResource)
              }, {
                type: 'match',
                valueString: JSON.stringify(matches)
              }]
            }]
          };
          if(operSummary.cruid.length > 0) {
            event.entity[0].detail.push({
              type: 'CRUID',
              valueString: operSummary.cruid[0]
            });
          }
          crCache.set(`csvreport_${operSummary.csvCode}`, JSON.stringify(event), 300);
          auditBundle.entry.push({
            resource: event,
            request: {
              method: 'PUT',
              url: `AuditEvent/${event.id}`
            }
          });
          crCache.del(`processingCSVReport_${operSummary.csvCode}`);
          saveCSVUploadAudiEvent(operSummary.csvCode);
          return resolve();
        }
        if(event.entity && event.entity.length >= 500) {
          closeCSVAuditEvent(event);
        }

        //check if matches of this uploaded CSV are among the processed patients from this same CSV and add this patient to those matches
        let entity = {
          what: {
            reference: `${operSummary.submittedResource.resourceType}/${operSummary.submittedResource.id}`
          },
          name: 'submittedResource',
          detail: [{
            type: 'submittedPatient',
            valueString: JSON.stringify(operSummary.submittedResource)
          }, {
            type: 'match',
            valueString: JSON.stringify(matches)
          }]
        };
        if(operSummary.cruid.length > 0) {
          entity.detail.push({
            type: 'CRUID',
            valueString: operSummary.cruid[0]
          });
        }
        event.entity.push(entity);
        for(let auto of operSummary.FHIRAutoMatches) {
          let csvTag = getCSVTag(auto.resource);
          if(csvTag && csvTag.code === operSummary.csvCode) {
            for(let index in event.entity) {
              let entity = event.entity[index];
              if(entity.what.reference === `Patient/${auto.resource.id}`) {
                let detIndex = entity.detail.findIndex((det) => {
                  return det.type === 'match';
                });
                if(detIndex === -1) {
                  continue;
                }
                let details = entity.detail[detIndex].valueString;
                try {
                  details = JSON.parse(details);
                } catch (error) {
                  logger.error(error);
                }
                let exist = details.autoMatches && details.autoMatches.find((mtch) => {
                  return mtch.resource.id === operSummary.submittedResource.id;
                });
                if(exist) {
                  continue;
                }
                details.autoMatches.push({
                  resource: operSummary.submittedResource,
                  score: auto.score,
                  threshold: auto.threshold
                });
                event.entity[index].detail[detIndex].valueString = JSON.stringify(details);
              }
            }
          }
        }

        for(let potential of operSummary.FHIRPotentialMatches) {0;
          let csvTag = getCSVTag(potential.resource);
          if(csvTag && csvTag.code === operSummary.csvCode) {
            for(let index in event.entity) {
              let entity = event.entity[index];
              if(entity.what.reference === `Patient/${potential.resource.id}`) {
                let detIndex = entity.detail.findIndex((det) => {
                  return det.type === 'match';
                });
                if(detIndex === -1) {
                  continue;
                }
                let details = entity.detail[detIndex].valueString;
                try {
                  details = JSON.parse(details);
                } catch (error) {
                  logger.error(error);
                }
                let exist = details.potentialMatches && details.potentialMatches.find((mtch) => {
                  return mtch.resource.id === operSummary.submittedResource.id;
                });
                if(exist) {
                  continue;
                }
                details.potentialMatches.push({
                  resource: operSummary.submittedResource,
                  score: potential.score,
                  threshold: potential.threshold
                });
                event.entity[index].detail[detIndex].valueString = JSON.stringify(details);
              }
            }
          }
        }
        crCache.set(`csvreport_${operSummary.csvCode}`, JSON.stringify(event), 300);
        if(eventIndexInBundle !== -1) {
          auditBundle.entry[eventIndexInBundle].resource = event;
        } else {
          auditBundle.entry.push({
            resource: event,
            request: {
              method: 'PUT',
              url: `AuditEvent/${event.id}`
            }
          });
        }
        crCache.del(`processingCSVReport_${operSummary.csvCode}`);
        saveCSVUploadAudiEvent(operSummary.csvCode);
        return resolve();
      });
    });
  }
}

function saveCSVUploadAudiEvent(csvCode) {
  return new Promise((resolve, reject) => {
    let scheduled = crCache.get(`scheduledSavingCSVReport_${csvCode}`);
    if(scheduled) {
      return resolve();
    } else {
      crCache.set(`scheduledSavingCSVReport_${csvCode}`, true);
      setTimeout(() => {
        crCache.del(`scheduledSavingCSVReport_${csvCode}`);
        crCache.set(`savingCSVReport_${csvCode}`, true);
        let event = crCache.get(`csvreport_${csvCode}`);
        try {
          event = JSON.parse(event);
        } catch (error) {
          logger.error(error);
        }
        let csvUploadAuditBundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [{
            resource: event,
            request: {
              method: 'PUT',
              url: `AuditEvent/${event.id}`
            }
          }]
        };
        fhirWrapper.saveResource({
          resourceData: csvUploadAuditBundle
        }, (err) => {
          crCache.del(`savingCSVReport_${csvCode}`);
          if(err) {
            return reject();
          }
          resolve();
        });
      }, 3000);
    }
  });
}
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
      subtype: [{
        system: 'http://hl7.org/fhir/restful-interaction',
        code: operSummary.action,
      }],
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
    if (operSummary.FHIRAutoMatches && operSummary.FHIRAutoMatches.length > 0) {
      for (const match of operSummary.FHIRAutoMatches) {
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
            potentialMatches: esmatch.potentialMatchResults,
            autoMatches: esmatch.autoMatchResults,
            conflictMatches: esmatch.conflictsMatchResults,
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

const addPatient = (clientID, patientsBundle, callback) => {
  let autoMatchPatientWithHumanAdjudTag = config.get("matching:autoMatchPatientWithHumanAdjudTag");
  const responseBundle = {
    resourceType: 'Bundle',
    entry: []
  };
  const responseHeaders = {
    CRUID: [],
    patientID: []
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

  const findMatches = ({
    patient,
    currentLinks = [],
    newPatient = true,
    bundle,
    hasHumanAdjudTag = false,
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
    let currentGoldenLink = '';
    if(currentLinks.length > 0) {
      currentGoldenLink = currentLinks[0].resource.id;
    }
    matchingTool.performMatch({
      sourceResource: patient,
      ignoreList: [patient.id],
      currentGoldenLink
    }, async ({
      error,
      FHIRAutoMatched,
      FHIRPotentialMatches,
      FHIRConflictsMatches,
      ESMatches,
      matchedGoldenRecords
    }) => {
      if (error) {
        operSummary.outcome = '8';
        operSummary.outcomeDesc = 'An error occured while finding matches';
        return callback(error, responseBundle, operationSummary);
      }
      operSummary.FHIRAutoMatches = FHIRAutoMatched.entry;
      operSummary.FHIRPotentialMatches = FHIRPotentialMatches.entry;
      operSummary.FHIRConflictsMatches = FHIRConflictsMatches.entry;
      operSummary.ESMatches = ESMatches;

      // if there is potential matches or conflict matches then add a tag
      let existsPotentialMatches = false;
      for(const potential of FHIRPotentialMatches.entry) {
        let isCurrentLink = currentLinks.find((currentLink) => {
          return potential.resource.link.find((link) => {
            return link.other.reference === currentLink.resource.resourceType + "/" + currentLink.resource.id;
          });
        });
        // if this potential match is currently linked to this patient and patient has human adjudication tag then this will be kept as a link, dont count as potential
        if(isCurrentLink && hasHumanAdjudTag && !autoMatchPatientWithHumanAdjudTag) {
          continue;
        } else {
          existsPotentialMatches = true;
        }
      }
      if(existsPotentialMatches) {
        if(!patient.meta) {
          patient.meta = {};
        }
        if(!patient.meta.tag) {
          patient.meta.tag = [];
        }
        let tagExist = patient.meta.tag.find((tag) => {
          return tag.system === matchIssuesURI && tag.code === 'potentialMatches';
        });
        if(!tagExist) {
          patient.meta.tag.push({
            system: matchIssuesURI,
            code: 'potentialMatches',
            display: 'Potential Matches'
          });
        }
      } else {
        // remove the potential match tag
        for(let tagIndex in patient.meta.tag) {
          let tag = patient.meta.tag[tagIndex];
          if(tag.system === matchIssuesURI && tag.code === 'potentialMatches') {
            patient.meta.tag.splice(tagIndex, 1);
          }
        }

        let parameters = {
          resourceType: 'Parameters',
          parameter: [{
            name: 'meta',
            valueMeta: {
              tag: {
                system: matchIssuesURI,
                code: 'potentialMatches',
                display: 'Potential Matches'
              }
            }
          }]
        };
        await fhirWrapper["$meta-delete"]({
          resourceParameters: parameters,
          resourceType: 'Patient',
          resourceID: patient.id
        });
      }
      let existsConflictMatches = false;
      for(const conflict of FHIRConflictsMatches.entry) {
        let isCurrentLink = currentLinks.find((currentLink) => {
          return conflict.resource.link.find((link) => {
            return link.other.reference === currentLink.resource.resourceType + "/" + currentLink.resource.id;
          });
        });
        // if this conflict match is currently linked to this patient and patient has human adjudication tag then this will be kept as a link, dont count as conflict
        if(isCurrentLink && hasHumanAdjudTag && !autoMatchPatientWithHumanAdjudTag) {
          continue;
        } else {
          existsConflictMatches = true;
        }
      }
      if(existsConflictMatches) {
        if(!patient.meta) {
          patient.meta = {};
        }
        if(!patient.meta.tag) {
          patient.meta.tag = [];
        }
        let tagExist = patient.meta.tag.find((tag) => {
          return tag.system === matchIssuesURI && tag.code === 'conflictMatches';
        });
        if(!tagExist) {
          patient.meta.tag.push({
            system: matchIssuesURI,
            code: 'conflictMatches',
            display: 'Conflict On Match'
          });
        }
      } else {
        // remove the conflict match tag
        for(let tagIndex in patient.meta.tag) {
          let tag = patient.meta.tag[tagIndex];
          if(tag.system === matchIssuesURI && tag.code === 'conflictMatches') {
            patient.meta.tag.splice(tagIndex, 1);
          }
        }

        let parameters = {
          resourceType: 'Parameters',
          parameter: [{
            name: 'meta',
            valueMeta: {
              tag: {
                system: matchIssuesURI,
                code: 'conflictMatches',
                display: 'Conflict On Match'
              }
            }
          }]
        };
        await fhirWrapper["$meta-delete"]({
          resourceParameters: parameters,
          resourceType: 'Patient',
          resourceID: patient.id
        });
      }
      // end of tagging match issues
      if (matchedGoldenRecords.entry && matchedGoldenRecords.entry.length === 0) {
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
          responseHeaders.CRUID.push(goldenRecord.resourceType + '/' + goldenRecord.id);
          responseHeaders.patientID.push(`Patient/${patient.id}`);

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
                responseBundle.entry = responseBundle.entry.concat(body.entry);
                let csvTag = getCSVTag(patient);
                if(csvTag && csvTag.code && body && body.entry) {
                  let patientHistory;
                  let latestHistory = 0;
                  for(let entry of body.entry) {
                    if(parseInt(entry.response.etag) > latestHistory && entry.response.location.startsWith(`Patient/${patient.id}/_history`)) {
                      patientHistory = entry.response.location;
                    }
                  }
                  if(patientHistory) {
                    let provenance = {
                      resourceType: 'Provenance',
                      id: uuid4(),
                      target: patientHistory,
                      recorded: moment().format('YYYY-MM-DDThh:mm:ss.SSSZ'),
                      agent: [
                        {
                          type: {
                            coding: [
                              {
                                system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
                                code: 'assembler'
                              }
                            ]
                          },
                          who: {reference: 'Device/mediator' }
                        }
                      ],
                      entity: [
                        {
                          role: 'source',
                          what: `DocumentReference/${csvTag.code}`
                        }
                      ]
                    };
                    bundle.entry.push({
                      resource: provenance,
                      request: {
                        method: 'PUT',
                        url: `Provenance/${provenance.id}`
                      }
                    });
                  }
                }
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
            // if has human adjudication tag then already has golden record
            if(!hasHumanAdjudTag || (hasHumanAdjudTag && autoMatchPatientWithHumanAdjudTag)) {
              addLinks(patient, goldenRecord);
            }
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
            return callback(false);
          }).catch((err) => {
            if (!operSummary.outcome) {
              operSummary.outcome = '8';
              operSummary.outcomeDesc = 'Unknown Error Occured';
            }
            return callback(err);
          });
        });
      } else if (matchedGoldenRecords.entry && matchedGoldenRecords.entry.length > 0) {
        if(hasHumanAdjudTag && !autoMatchPatientWithHumanAdjudTag) {
          for (const currentLink of currentLinks) {
            operSummary.cruid.push(currentLink.resource.resourceType + '/' + currentLink.resource.id);
            responseHeaders.CRUID.push(currentLink.resource.resourceType + '/' + currentLink.resource.id);
            responseHeaders.patientID.push(`Patient/${patient.id}`);
          }
          for (const goldenRecord of matchedGoldenRecords.entry) {
            let isSame = currentLinks.find((currLink) => {
              return currLink.resource.id === goldenRecord.resource.id;
            });
            // if matched golden record is different from the existing golden record then this is a conflict
            if(!isSame) {
              if(!patient.meta) {
                patient.meta = {};
              }
              if(!patient.meta.tag) {
                patient.meta.tag = [];
              }
              let tagExist = patient.meta.tag.find((tag) => {
                return tag.system === matchIssuesURI && tag.code === 'conflictMatches';
              });
              if(!tagExist) {
                patient.meta.tag.push({
                  system: matchIssuesURI,
                  code: 'conflictMatches',
                  display: 'Conflict On Match'
                });
                bundle.entry.push({
                  resource: patient,
                  request: {
                    method: 'PUT',
                    url: `Patient/${patient.id}`,
                  },
                });
              }
            }
          }
        } else {
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
            responseHeaders.CRUID.push(goldenRecord.resource.resourceType + '/' + goldenRecord.resource.id);
            responseHeaders.patientID.push(`Patient/${patient.id}`);
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
        }
        operSummary.FHIRAutoMatches = FHIRAutoMatched.entry;
        operSummary.FHIRPotentialMatches = FHIRPotentialMatches.entry;
        operSummary.FHIRConflictsMatches = FHIRConflictsMatches.entry;
        operSummary.ESMatches = ESMatches;
        return callback(false);
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
    processCSVTag(newPatient.resource);
    let csvCode = getCSVTag(newPatient.resource);
    const operSummary = {};
    if(csvCode) {
      operSummary.csvCode = csvCode.code;
    }
    operSummary.cruid = [];
    const bundle = {};
    bundle.type = 'batch';
    bundle.resourceType = 'Bundle';
    bundle.entry = [];

    // Tag this patient with an ID of the system that submitted
    const tagExist = newPatient.resource.meta && newPatient.resource.meta.tag && newPatient.resource.meta.tag.find((tag) => {
      return tag.system === "http://openclientregistry.org/fhir/clientid";
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
      newPatient.resource.meta.lastUpdated = moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
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
        if(!newPatient.resource.id) {
          newPatient.resource.id = uuid4();
        }
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
          }, (err, body) => {
            if (err) {
              operSummary.outcome = '8';
              operSummary.outcomeDesc = 'An error occured while saving a bundle that contians matches of a submitted resource and the submitted resource itself';
              operationSummary.push(operSummary);
              return nxtPatient();
            }
            responseBundle.entry = responseBundle.entry.concat(body.entry);
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

        let adjudTag = existingPatient.resource.meta && existingPatient.resource.meta.tag && existingPatient.resource.meta.tag.find((tag) => {
          return tag.system === humanAdjudURI && tag.code === 'humanAdjudication';
        });
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
            // if patient has human adjudication tag then dont delete existing link as no modification will be done even if there will be some new auto matches
            if(!adjudTag || (adjudTag && autoMatchPatientWithHumanAdjudTag)) {
              delete existingPatient.resource.link;
            }
            existingPatient.resource = _.merge(existingPatient.resource, newPatient.resource);
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
           * Remove link of this submitted patient from the golden record
           */
          callback => {
            if(adjudTag) {
              return callback(null);
            }
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
            hasHumanAdjudTag: adjudTag,
            operSummary
          }, (err) => {
            console.log('here');
            if (err) {
              operationSummary.push(operSummary);
              return nxtPatient();
            }
            console.log('here1');
            fhirWrapper.saveResource({
              resourceData: bundle,
            }, (err, body) => {
              responseBundle.entry = responseBundle.entry.concat(body.entry);
              //create the Provenance resource
              let provenanceBundle = {};
              provenanceBundle.type = 'batch';
              provenanceBundle.resourceType = 'Bundle';
              provenanceBundle.entry = [];
              let csvTag = getCSVTag(existingPatient.resource);
              if(csvTag && csvTag.code && body && body.entry) {
                let patientHistory;
                let latestHistory = 0;
                for(let entry of body.entry) {
                  if(parseInt(entry.response.etag) > latestHistory && entry.response.location.startsWith(`Patient/${existingPatient.resource.id}/_history`)) {
                    patientHistory = entry.response.location;
                  }
                }
                if(patientHistory) {
                  let provenance = {
                    resourceType: 'Provenance',
                    id: uuid4(),
                    target: [{
                      reference: patientHistory
                    }],
                    recorded: moment().format('YYYY-MM-DDThh:mm:ss.SSSZ'),
                    agent: [
                      {
                        type: {
                          coding: [
                            {
                              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
                              code: 'assembler'
                            }
                          ]
                        },
                        who: {reference: 'Device/mediator' }
                      }
                    ],
                    entity: [
                      {
                        role: 'source',
                        what: { reference: `DocumentReference/${csvTag.code}`}
                      }
                    ]
                  };
                  provenanceBundle.entry.push({
                    resource: provenance,
                    request: {
                      method: 'PUT',
                      url: `Provenance/${provenance.id}`
                    }
                  });
                  fhirWrapper.saveResource({
                    resourceData: provenanceBundle
                  }, () => {});
                }
              }
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
      return callback(true, responseBundle, responseHeaders, operationSummary);
    }
    logger.info('Done adding patient');
    return callback(false, responseBundle, responseHeaders, operationSummary);
  });
};

const getCSVTag = (patient) => {
  let csvTag = patient.meta && patient.meta.tag && patient.meta.tag.find((tag) => {
    return tag.system === URI(config.get("systems:CRBaseURI")).segment('tag').segment('csv').toString();
  });
  return csvTag;
};
const processCSVTag = (patient) => {
  return new Promise((resolve) => {
    let csvTag = getCSVTag(patient);
    if(!csvTag || (csvTag && !csvTag.code)) {
      return resolve();
    }
    let docRef = crCache.get(`docRef_${csvTag.code}`);
    if(docRef) {
      try {
        docRef = JSON.parse(docRef);
      } catch (error) {
        logger.error(error);
      }
      return resolve(docRef);
    }
    fhirWrapper.getResource({
      resource: 'DocumentReference',
      query: `_id=${csvTag.code}`
    }, (docRefBundle) => {
      let docRef;
      if(docRefBundle.entry.length > 0) {
        docRef = docRefBundle.entry[0].resource;
      } else {
        docRef = {
          resourceType: 'DocumentReference',
          id: csvTag.code,
          status: 'current',
          type: {
            coding: [{
              system: URI(config.get("systems:CRBaseURI")).segment('CodeSystem').segment('doc-types').toString(),
              code: 'csv_upload'
            }],
            text: 'CSV Upload'
          },
          date: moment().format("YYYY-MM-DDThh:mm:ss.SSSZ"),
          description: csvTag.display,
          content: [
            {
              attachment: {
                contentType: 'text/csv',
                title: csvTag.display
              }
            }
          ]
        };
        let bundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: [{
            resource: docRef,
            request: {
              method: 'PUT',
              url: `DocumentReference/${docRef.id}`,
            }
          }]
        };
        fhirWrapper.saveResource({
          resourceData: bundle
        }, () => {});
      }
      crCache.set(`docRef_${csvTag.code}`, JSON.stringify(docRef));
      return resolve(docRef);
    });
  });
};

module.exports = {
  addPatient,
  createAddPatientAudEvent,
  createCSVUploadAudEvent,
  saveCSVUploadAudiEvent
};