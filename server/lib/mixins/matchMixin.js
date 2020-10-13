const URI = require('urijs');
const async = require('async');
const uuid4 = require('uuid/v4');
const _ = require('lodash');
const moment = require('moment');
const fhirWrapper = require('../fhir')();
const medMatching = require('../medMatching')();
const esMatching = require('../esMatching');
const cacheFHIR = require('../tools/cacheFHIR');
const logger = require('../winston');
const config = require('../config');
const matchIssuesURI = URI(config.get("systems:CRBaseURI")).segment('matchIssues').toString();
const humanAdjudURI = URI(config.get("systems:CRBaseURI")).segment('humanAdjudication').toString();

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
            return callback();
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
            responseBundle.entry.push({
              response: {
                location: currentLink.resource.resourceType + '/' + currentLink.resource.id
              }
            });
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
        }
        operSummary.FHIRMatches = FHIRAutoMatched.entry;
        operSummary.ESMatches = ESMatches;
        return callback();
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
};

module.exports = {
  addPatient,
  createAddPatientAudEvent
};