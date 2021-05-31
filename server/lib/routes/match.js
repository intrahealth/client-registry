const express = require("express");
const router = express.Router();
const URI = require('urijs');
const moment = require('moment');
const async = require('async');
const uuid4 = require('uuid/v4');
const generalMixin = require('../mixins/generalMixin');
const matchMixin = require('../mixins/matchMixin');
const fhirWrapper = require('../fhir')();
const medMatching = require('../medMatching')();
const esMatching = require('../esMatching');
const logger = require('../winston');
const config = require('../config');
const matchIssuesURI = URI(config.get("systems:CRBaseURI")).segment('matchIssues').toString();
const humanAdjudicationURI = URI(config.get("systems:CRBaseURI")).segment('humanAdjudication').toString();

router.post('/resolve-match-issue', async(req, res) => {
  logger.info('Received a request to resolve match issues');
  let {resolves, resolvingFrom, removeFlag, flagType} = req.body;
  let query = '';
  let addedToQuery = [];
  for(let patient of resolves) {
    let joinedThisCRUID = resolves.find((resolve) => {
      return resolve.uid !== resolve.ouid && resolve.uid === patient.ouid;
    });
    if(patient.uid !== patient.ouid || joinedThisCRUID) {
      let uidAdded = addedToQuery.find((id) => {
        return id === patient.uid;
      });
      let ouidAdded = addedToQuery.find((id) => {
        return id === patient.ouid;
      });
      let idAdded = addedToQuery.find((id) => {
        return id === patient.id;
      });
      if(!query) {
        addedToQuery.push(patient.id);
        addedToQuery.push(patient.ouid);
        query = `_id=${patient.id},${patient.ouid}`;
        if(!uidAdded) {
          addedToQuery.push(patient.uid);
          query += `,${patient.uid}`;
        }
      } else {
        if(!idAdded) {
          query += `,${patient.id}`;
          addedToQuery.push(patient.id);
        }
        if(!ouidAdded) {
          query += `,${patient.ouid}`;
          addedToQuery.push(patient.ouid);
        }
        if(!uidAdded) {
          query += `,${patient.uid}`;
          addedToQuery.push(patient.uid);
        }
      }
    }
  }
  const modifiedResourceData = {};
  modifiedResourceData.type = 'batch';
  modifiedResourceData.resourceType = 'Bundle';
  modifiedResourceData.entry = [];
  if(query) {
    let idAdded = addedToQuery.find((id) => {
      return id === resolvingFrom;
    });
    if(!idAdded) {
      query += `,${resolvingFrom}`;
    }
    fhirWrapper.getResource({
      resource: 'Patient',
      query,
      noCaching: true
    }, (originalResourceData, statusCode) => {
      if(statusCode < 200 || statusCode > 299) {
        logger.error('An error has occured, stop resolving match issues');
        return res.status(statusCode).send();
      }
      for(let patient of resolves) {
        if(patient.uid !== patient.ouid) {
          let patientResource = originalResourceData.entry.find((entry) => {
            return entry.resource.id === patient.id;
          });
          let oldCRUID = originalResourceData.entry.find((entry) => {
            return entry.resource.id === patient.ouid;
          });
          let newCRUID = originalResourceData.entry.find((entry) => {
            return entry.resource.id === patient.uid;
          });
          if(patient.uid.startsWith('New CR ID')) {
            newCRUID = {};
            newCRUID.resource = fhirWrapper.createGoldenRecord();
            newCRUID.resource.link = [];
          }
          // remove old CRUID  and add new CRUID from/to patient
          for(let index in patientResource.resource.link) {
            let linkID = patientResource.resource.link[index].other.reference.split('/')[1];
            if(linkID === oldCRUID.resource.id) {
              patientResource.resource.link.splice(index, 1);
            }
          }
          patientResource.resource.link.push({
            other: {
              reference: 'Patient/' + newCRUID.resource.id
            },
            type: 'refer'
          });
          modifiedResourceData.entry.push({
            resource: patientResource.resource,
            request: {
              method: 'PUT',
              url: 'Patient/' + patientResource.resource.id
            }
          });
          // end of modifying patient

          //remove patient from old CRUID
          for(let index in oldCRUID.resource.link) {
            let patientID = oldCRUID.resource.link[index].other.reference.split('/')[1];
            if(patientID === patientResource.resource.id) {
              oldCRUID.resource.link.splice(index, 1);
            }
          }
          if(oldCRUID.resource.link.length === 0) {
            oldCRUID.resource.link.push({
              other: {
                reference: 'Patient/' + newCRUID.resource.id
              },
              type: 'replaced-by'
            });
          }
          modifiedResourceData.entry.push({
            resource: oldCRUID.resource,
            request: {
              method: 'PUT',
              url: 'Patient/' + oldCRUID.resource.id
            }
          });
          // end of removing patient from old CRUID

          //add patient into new CRUID
          newCRUID.resource.link.push({
            other: {
              reference: 'Patient/' + patientResource.resource.id
            },
            type: 'seealso'
          });
          modifiedResourceData.entry.push({
            resource: newCRUID.resource,
            request: {
              method: 'PUT',
              url: 'Patient/' + newCRUID.resource.id
            }
          });
          //end of adding patient into new CRUID
        }
      }
      fhirWrapper.saveResource({ resourceData: modifiedResourceData }, (err) => {
        if(err) {
          return res.status(500).send();
        }
        // now loop through all the patients, check if there is no match issue then remove the match issue tag, otherwise then the match tag should be kept
        let matchingTool;
        if (config.get("matching:tool") === "mediator") {
          matchingTool = medMatching;
        } else if (config.get("matching:tool") === "elasticsearch") {
          matchingTool = esMatching;
        }
        let errorOccured = false;
        async.each(resolves, (resolvePatient, nxtRes) => {
          //if no any modification made then skip checking
          //for now lets do this check for resources that we are not resolving from, will need to change this in the future
          if(resolvePatient.id !== resolvingFrom) {
            // check if there is any patient that joined uuid of this patient
            let joinedThisCRUID = resolves.find((resolve) => {
              return resolve.uid !== resolve.ouid && resolve.uid === resolvePatient.uid;
            });
            if(resolvePatient.uid === resolvePatient.ouid && !joinedThisCRUID) {
              return nxtRes();
            }
          }
          // end of checking modification made
          let resolvePatientResource = modifiedResourceData.entry.find((entry) => {
            return entry.resource.id === resolvePatient.id;
          });
          if(!resolvePatientResource) {
            resolvePatientResource = originalResourceData.entry.find((entry) => {
              return entry.resource.id === resolvePatient.id;
            });
          }
          if(!resolvePatientResource) {
            return nxtRes();
          }
          matchingTool.performMatch({
            sourceResource: resolvePatientResource.resource,
            ignoreList: [resolvePatientResource.resource.id],
          }, ({
            FHIRAutoMatched,
            FHIRPotentialMatches,
            FHIRConflictsMatches
          }) => {
            // remove any resolved conflicts
            FHIRConflictsMatches.entry = FHIRConflictsMatches.entry.filter((entry) => {
              let needsResolving = true;
              let link;
              if(entry.resource.link) {
                link = entry.resource.link[0].split('/')[1];
              }
              if(resolvePatient.uid === link) {
                needsResolving = false;
              }
              //if a connflict comes from patient selected for resolving and user decided to remove the flag then dont add this to conflicts
              if(entry.resource.id === resolvingFrom && removeFlag) {
                needsResolving = false;
              }
              return needsResolving;
            });

            // this checks those that has higher scores but are not linked to this patient
            FHIRConflictsMatches.entry = FHIRAutoMatched.entry.filter((entry) => {
              let needsResolving = true;
              let link;
              if(entry.resource.link) {
                link = entry.resource.link[0].other.reference.split('/')[1];
              }
              if(resolvePatient.uid === link) {
                needsResolving = false;
              }
              //if a potential match comes from patient selected for resolving and user decided to remove the flag then dont add this to potential matches
              if(entry.resource.id === resolvingFrom && removeFlag) {
                needsResolving = false;
              }
              return needsResolving;
            });
            // end of removing any resolved potential matches
            // end of removing resolved conflicts

            // remove any resolved potential matches
            FHIRPotentialMatches.entry = FHIRPotentialMatches.entry.filter((entry) => {
              let needsResolving = true;
              let link;
              if(entry.resource.link) {
                link = entry.resource.link[0].other.reference.split('/')[1];
              }
              if(resolvePatient.uid === link) {
                needsResolving = false;
              }
              //if a potential match comes from patient selected for resolving and user decided to remove the flag then dont add this to potential matches
              if(entry.resource.id === resolvingFrom && removeFlag) {
                needsResolving = false;
              }
              return needsResolving;
            });
            // end of removing any resolved potential matches

            async.parallel({
              potentialMatches: async (callback) => {
                if(FHIRPotentialMatches.entry.length === 0 || (flagType === 'potentialMatches' && removeFlag)) {
                  if(resolvePatientResource.resource.meta && resolvePatientResource.resource.meta.tag) {
                    for(let tagIndex in resolvePatientResource.resource.meta.tag) {
                      let tag = resolvePatientResource.resource.meta.tag[tagIndex];
                      if(tag.system === matchIssuesURI && tag.code === 'potentialMatches') {
                        resolvePatientResource.resource.meta.tag.splice(tagIndex, 1);
                        resolvePatientResource.resource.meta.tag.push({
                          system: humanAdjudicationURI,
                          code: 'humanAdjudication',
                          display: 'Matched By Human'
                        });
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
                    logger.info('Removing potential match tag');
                    await fhirWrapper["$meta-delete"]({
                      resourceParameters: parameters,
                      resourceType: 'Patient',
                      resourceID: resolvePatientResource.resource.id
                    }).catch(() => {
                      logger.error('An error has occured while removing potential match tag');
                      errorOccured = true;
                      return callback(null);
                    });
                    logger.info('Potential match tag removed');
                  } else {
                    return callback(null);
                  }
                } else {
                  if(!resolvePatientResource.resource.meta) {
                    resolvePatientResource.resource.meta = {};
                  }
                  if(!resolvePatientResource.resource.meta.tag) {
                    resolvePatientResource.resource.meta.tag = [];
                  }
                  let tagExist = resolvePatientResource.resource.meta.tag.find((tag) => {
                    return tag.system === matchIssuesURI && tag.code === 'potentialMatches';
                  });
                  if(!tagExist) {
                    resolvePatientResource.resource.meta.tag.push({
                      system: matchIssuesURI,
                      code: 'potentialMatches',
                      display: 'Potential Matches'
                    });
                  }
                  return callback(null);
                }
              },
              conflictsMatches: async (callback) => {
                if(FHIRConflictsMatches.entry.length === 0 || (flagType === 'conflictMatches' && removeFlag)) {
                  if(resolvePatientResource.resource.meta && resolvePatientResource.resource.meta.tag) {
                    for(let tagIndex in resolvePatientResource.resource.meta.tag) {
                      let tag = resolvePatientResource.resource.meta.tag[tagIndex];
                      if(tag.system === matchIssuesURI && tag.code === 'conflictMatches') {
                        resolvePatientResource.resource.meta.tag.splice(tagIndex, 1);
                        resolvePatientResource.resource.meta.tag.push({
                          system: humanAdjudicationURI,
                          code: 'humanAdjudication',
                          display: 'Matched By Human'
                        });
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
                      resourceID: resolvePatientResource.resource.id
                    }).catch(() => {
                      logger.error('An error has occured while removing conflict match tag');
                      errorOccured = true;
                      return callback(null);
                    });
                  } else {
                    return callback(null);
                  }
                } else {
                  if(!resolvePatientResource.resource.meta) {
                    resolvePatientResource.resource.meta = {};
                  }
                  if(!resolvePatientResource.resource.meta.tag) {
                    resolvePatientResource.resource.meta.tag = [];
                  }
                  let tagExist = resolvePatientResource.resource.meta.tag.find((tag) => {
                    return tag.system === matchIssuesURI && tag.code === 'potentialMatches';
                  });
                  if(!tagExist) {
                    resolvePatientResource.resource.meta.tag.push({
                      system: matchIssuesURI,
                      code: 'conflictMatches',
                      display: 'Conflict On Match'
                    });
                  }
                  return callback(null);
                }
              }
            }, () => {
              modifiedResourceData.entry = [];
              modifiedResourceData.entry.push({
                resource: resolvePatientResource.resource,
                request: {
                  method: 'PUT',
                  url: 'Patient/' + resolvePatientResource.resource.id
                }
              });
              fhirWrapper.saveResource({ resourceData: modifiedResourceData}, (err) => {
                if(err) {
                  errorOccured = true;
                }
                return nxtRes();
              });
            });
          });
        }, () => {
          if(errorOccured) {
            return res.status(500).send();
          }
          return res.status(200).send();
        });
      });
    });
  } else {
    if(removeFlag) {
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
      logger.info('Removing potential match tag');
      await fhirWrapper["$meta-delete"]({
        resourceParameters: parameters,
        resourceType: 'Patient',
        resourceID: resolvingFrom
      }).catch(() => {
        logger.error('An error has occured while removing potential match tag');
        return res.status(500).send();
      });

      parameters = {
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
        resourceID: resolvingFrom
      }).catch(() => {
        logger.error('An error has occured while removing conflict match tag');
        return res.status(500).send();
      });
      fhirWrapper.getResource({
        resource: 'Patient',
        id: resolvingFrom,
        noCaching: true
      }, (resolvingFromResource, statusCode) => {
        if(statusCode < 200 || statusCode > 299) {
          return res.status(500).send();
        }
        if(!resolvingFromResource.meta) {
          resolvingFromResource.meta = {};
        }
        if(!resolvingFromResource.meta.tag) {
          resolvingFromResource.meta.tag = [];
        }
        resolvingFromResource.meta.tag.push({
          system: humanAdjudicationURI,
          code: 'humanAdjudication',
          display: 'Matched By Human'
        });
        modifiedResourceData.entry = [];
        modifiedResourceData.entry.push({
          resource: resolvingFromResource,
          request: {
            method: 'PUT',
            url: 'Patient/' + resolvingFromResource.id
          }
        });
        fhirWrapper.saveResource({ resourceData: modifiedResourceData}, (err) => {
          if(err) {
            return res.status(500).send();
          }
          return res.status(200).send();
        });
      });
    } else {
      return res.status(202).send();
    }
  }
});

router.post('/break-match', (req, res) => {
  logger.info("Received a request to break match");
  const operationSummary = [];
  const ids = req.body;
  if (!Array.isArray(ids)) {
    logger.error('Invalid requ;est, expected an array of IDs but non was found in ' + ids);
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
                return res.status(200).send('Match Broken');
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

  function saveAuditEvent (callback) {
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
          subtype: [{
            system: 'http://hl7.org/fhir/restful-interaction',
            code: 'update',
          }],
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
  }
});

router.get(`/count-match-issues`, (req, res) => {
  logger.info("Received a request to count match issues");
  fhirWrapper.getResource({
    resource: 'Patient',
    query: `_tag=${matchIssuesURI}|potentialMatches,${matchIssuesURI}|conflictMatches&_summary=count`,
    noCaching: true
  }, (issuesCount) => {
    logger.info(`Returning ${issuesCount.total} match issues`);
    return res.status(200).json({total: issuesCount.total});
  });
});

router.get('/potential-matches/:id', (req, res) => {
  logger.info("Received a request to get potential matches");
  let matchResults = [];
  fhirWrapper.getResource({
    resource: 'Patient',
    id: req.params.id,
    noCaching: true
  }, (patient) => {
    generateScoreMatrix(patient, () => {
      return res.status(200).send(matchResults);
    });
  });

  function matrixExist(sourceID) {
    let found = false;
    for(let matrix of matchResults) {
      if(matrix.source_id === sourceID) {
        found = true;
        break;
      }
      if(found) {
        break;
      }
    }
    return found;
  }

  function generateScoreMatrix(patient, callback) {
    let matchingTool;
    if (config.get("matching:tool") === "mediator") {
      matchingTool = medMatching;
    } else if (config.get("matching:tool") === "elasticsearch") {
      matchingTool = esMatching;
    }
    matchingTool.performMatch({
      sourceResource: patient,
      ignoreList: [patient.id],
    }, ({
      error,
      FHIRAutoMatched,
      FHIRPotentialMatches,
      FHIRConflictsMatches,
      ESMatches
    }) => {
      let link = patient.link[0].other.reference;
      let goldenLink = link.split('/')[1];
      const validSystem = generalMixin.getClientIdentifier(patient);

      let name = patient.name.find((name) => {
        return name.use === 'official';
      });
      let given = '';
      if(name && name.given) {
        given = name.given.join(' ');
      }
      let clientUserId;
      if (patient.meta && patient.meta.tag) {
        for (let tag of patient.meta.tag) {
          if (
            tag.system === "http://openclientregistry.org/fhir/clientid"
          ) {
            clientUserId = tag.code;
          }
        }
      }
      let systemName = generalMixin.getClientDisplayName(clientUserId);
      let phone;
      if(patient.telecom) {
        for(let telecom of patient.telecom) {
          if(telecom.system === 'phone') {
            phone = telecom.value;
          }
        }
      }
      let nationalid;
      let artnumber;
      if(patient.identifier) {
        for(let identifier of patient.identifier) {
          if(identifier.system === 'http://clientregistry.org/nationalid') {
            nationalid = identifier.value;
          } else if(identifier.system === 'http://clientregistry.org/artnumber') {
            artnumber = identifier.value
;          }
        }
      }
      let primaryPatient = {
        id: patient.id,
        gender: patient.gender,
        given,
        family: name.family,
        birthDate: patient.birthDate,
        phone,
        nationalid,
        artnumber,
        uid: goldenLink,
        ouid: goldenLink,
        source_id: validSystem.value,
        source: systemName,
        scores: {}
      };
      populateScores(primaryPatient, ESMatches, FHIRPotentialMatches, FHIRAutoMatched, FHIRConflictsMatches);
      matchResults.push(primaryPatient);
      async.series({
        auto: (callback) => {
          async.eachSeries(FHIRAutoMatched.entry, (autoMatched, nxtAutoMatched) => {
            const validSystem = generalMixin.getClientIdentifier(autoMatched.resource);
            if(matrixExist(validSystem.value)) {
              return nxtAutoMatched();
            }
            generateScoreMatrix(autoMatched.resource, () => {
              return nxtAutoMatched();
            });
          }, () => {
            return callback(null);
          });
        },
        potential: (callback) => {
          async.eachSeries(FHIRPotentialMatches.entry, (potentialMatch, nxtPotMatch) => {
            const validSystem = generalMixin.getClientIdentifier(potentialMatch.resource);
            if(matrixExist(validSystem.value)) {
              return nxtPotMatch();
            }
            generateScoreMatrix(potentialMatch.resource, () => {
              return nxtPotMatch();
            });
          }, () => {
            return callback(null);
          });
        },
        conflicts: (callback) => {
          async.eachSeries(FHIRConflictsMatches.entry, (conflictMatch, nxtConflictMatch) => {
            const validSystem = generalMixin.getClientIdentifier(conflictMatch.resource);
            if(matrixExist(validSystem.value)) {
              return nxtConflictMatch();
            }
            generateScoreMatrix(conflictMatch.resource, () => {
              return nxtConflictMatch();
            });
          }, () => {
            return callback(null);
          });
        }
      }, () => {
        return callback();
      });
    });
  }
  function populateScores(patient, ESMatches, FHIRPotentialMatches, FHIRAutoMatched, FHIRConflictsMatches) {
    for(let esmatch of ESMatches) {
      for(let autoMatch of esmatch.autoMatchResults) {
        let patResource = FHIRAutoMatched.entry.find((entry) => {
          return entry.resource.id === autoMatch['_id'];
        });
        const validSystem = generalMixin.getClientIdentifier(patResource.resource);
        patient.scores[validSystem.value] = autoMatch['_score'];
      }
      for(let potMatch of esmatch.potentialMatchResults) {
        let patResource = FHIRPotentialMatches.entry.find((entry) => {
          return entry.resource.id === potMatch['_id'];
        });
        if(!patResource) {
          continue;
        }
        const validSystem = generalMixin.getClientIdentifier(patResource.resource);
        patient.scores[validSystem.value] = potMatch['_score'];
      }
      for(let conflMatch of esmatch.conflictsMatchResults) {
        let patResource = FHIRConflictsMatches.entry.find((entry) => {
          return entry.resource.id === conflMatch['_id'];
        });
        if(!patResource) {
          continue;
        }
        const validSystem = generalMixin.getClientIdentifier(patResource.resource);
        patient.scores[validSystem.value] = conflMatch['_score'];
      }
    }
  }
});

router.get(`/get-match-issues`, (req, res) => {
  const clientIDURI = URI(config.get("systems:CRBaseURI")).segment('clientid').toString();
  fhirWrapper.getResource({
    resource: 'Patient',
    query: `_tag=${matchIssuesURI}|potentialMatches,${matchIssuesURI}|conflictMatches`,
    noCaching: true
  }, (issues) => {
    let reviews = [];
    for(let entry of issues.entry) {
      let name = entry.resource.name.find((name) => {
        return name.use === 'official';
      });
      let given = '';
      if(name && name.given) {
        given = name.given.join(' ');
      }
      let link = '';
      if(entry.resource.link) {
        link = entry.resource.link[0].other.reference;
      }
      if(link) {
        link = link.split('/')[1];
      }
      const validSystem = entry.resource.identifier && entry.resource.identifier.find(identifier => {
        return 'http://openclientregistry.org/fhir/sourceid' && identifier.value;
      });

      let matchTag = entry.resource.meta.tag.find((tag) => {
        return tag.system === matchIssuesURI;
      });
      let clientsTag = entry.resource.meta.tag.find((tag) => {
        return tag.system === clientIDURI;
      });
      let review = {
        id: entry.resource.id,
        gender: entry.resource.gender,
        family: name.family,
        given,
        birthDate: entry.resource.birthDate,
        uid: link,
        source: clientsTag.code,
        source_id: validSystem.value,
        reason: matchTag.display,
        reasonCode: matchTag.code
      };
      reviews.push(review);
    }
    return res.status(200).json(reviews);
  });
});

router.post('/unbreak-match', (req, res) => {
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
  let dontSaveChanges = false;
  let query;
  let addedToQuery = [];
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
      let id1Added = addedToQuery.find((id) => {
        return id === idPair.id1;
      });
      let id2Added = addedToQuery.find((id) => {
        return id === idPair.id2;
      });
      if(!id1Added) {
        addedToQuery.push(idPair.id1);
        query += ',' + idPair.id1;
      }
      if(!id2Added) {
        addedToQuery.push(idPair.id2);
        query += ',' + idPair.id2;
      }
    } else {
      addedToQuery.push(idPair.id1);
      addedToQuery.push(idPair.id2);
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
              matchMixin.addPatient(clientID, patientsBundle, (err, response, operSum) => {
                // operationSummary.push(operSum);
                const tmpAuditBundle = matchMixin.createAddPatientAudEvent(operationSummary, req);
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
      logger.error(JSON.stringify(auditBundle,0,2));
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

module.exports = router;