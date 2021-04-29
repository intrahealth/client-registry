const express = require("express");
const router = express.Router();
const URI = require('urijs');
const async = require('async');
const fhirWrapper = require('../fhir')();
const matchMixin = require('../mixins/matchMixin');
const logger = require('../winston');
const config = require('../config');

router.get('/:resource?/:id?', (req, res) => {
  logger.info(`Received a request to get data for resource ${req.params.resource}`);
  const id = req.params.id;
  if (id === '$ihe-pix') {
    pixmRequest({
      req
    }, (resourceData, statusCode) => {
      logger.error(JSON.stringify(resourceData,0,2));
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
    return callback(outcome, 400);
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
        parameters.parameter.push({
          name: 'targetId',
          valueReference: entry.resource.fullUrl
        });
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

router.post('/', (req, res) => {
  logger.info('Received a request to add a bundle of resources');
  const resource = req.body;
  if (!resource.resourceType ||
    (resource.resourceType && resource.resourceType !== 'Bundle') ||
    !resource.entry || (resource.entry && resource.entry.length === 0)) {
    return res.status(400).json({
      resourceType: "OperationOutcome",
      issue: [{
        severity: "error",
        code: "processing",
        diagnostics: "Invalid bundle submitted"
      }],
      response: {
        status: 400
      }
    });
  }
  let patients = resource.entry.filter((entry) => {
    return entry.resource && entry.resource.resourceType === "Patient";
  });
  let otherResources = {
    resourceType: resource.resourceType,
    type: resource.type,
    entry: []
  };
  otherResources.entry = resource.entry.filter((entry) => {
    return entry.resource && entry.resource.resourceType !== "Patient";
  });
  async.parallel({
    otherResources: (callback) => {
      if(otherResources.entry.length === 0) {
        return callback(null, {});
      }
      fhirWrapper.create(otherResources, (code, err, response, body) => {
        return callback(null, {code, err, response, body});
      });
    },
    patients: (callback) => {
      if(patients.length === 0) {
        return callback(null, {});
      }
      let patientsBundle = {
        entry: patients
      };
      let clientID;
      if(req.connection && typeof req.connection.getPeerCertificate === "function") {
        const cert = req.connection.getPeerCertificate();
        clientID = cert.subject.CN;
      } else if(req.headers['x-openhim-clientid']) {
        clientID = req.headers['x-openhim-clientid'];
      }
      // if (config.get('mediator:register')) {
      //   clientID = req.headers['x-openhim-clientid'];
      // } else {
      //   const cert = req.connection.getPeerCertificate();
      //   clientID = cert.subject.CN;
      // }
      matchMixin.addPatient(clientID, patientsBundle, (err, responseBundle, responseHeaders, operationSummary) => {
        if (err) {
          return callback(null, {code: 500, err, responseBundle, responseHeaders, body: operationSummary});
        }
        return callback(null, {code: 200, err, responseBundle, responseHeaders, body: operationSummary});
      });
    }
  }, (err, results) => {
    let code;
    if(results.patients.code > results.otherResources.code) {
      code = results.patients.code;
    } else {
      code = results.otherResources.code;
    }
    if(!code) {
      code = 500;
    }
    let filteredResponseBundle = [];
    for(let entry of results.patients.responseBundle.entry) {
      let exists = filteredResponseBundle.findIndex((fil) => {
        return fil.response.location.startsWith(entry.response.location.split('/_history')[0]);
      });
      if(exists === -1) {
        filteredResponseBundle.push(entry);
      } else {
        let replaceIndex = filteredResponseBundle.findIndex((fil) => {
          return parseInt(fil.response.etag) < parseInt(entry.response.etag) && fil.response.location.startsWith(entry.response.location.split('/_history')[0]);
        });
        if(replaceIndex !== -1) {
          filteredResponseBundle.splice(replaceIndex, 1);
          filteredResponseBundle.push(entry);
        }
      }
    }
    res.setHeader('Location', JSON.stringify(results.patients.responseHeaders.patientID));
    res.setHeader('LocationCRUID', JSON.stringify(results.patients.responseHeaders.CRUID));
    return res.status(code).json(filteredResponseBundle);
  });
});

router.post('/:resourceType', (req, res) => {
  saveResource(req, res);
});

router.put('/:resourceType/:id', (req, res) => {
  saveResource(req, res);
});

function saveResource(req, res) {
  let resource = req.body;
  let resourceType = req.params.resourceType;
  let id = req.params.id;
  if(id && !resource.id) {
    resource.id = id;
  }
  logger.info('Received a request to add resource type ' + resourceType);
  if(resourceType !== "Patient") {
    fhirWrapper.create(resource, (code, err, response, body) => {
      return res.status(code).send(body);
    });
  } else {
    if(!resource.resourceType || !resource.identifier || (resource.identifier && resource.identifier.length === 0)) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Invalid patient resource submitted"
        }],
        response: {
          status: 400
        }
      });
    }
    const patientsBundle = {
      entry: [{
        resource
      }]
    };

    let clientID;
    if(req.connection && typeof req.connection.getPeerCertificate === "function") {
      const cert = req.connection.getPeerCertificate();
      clientID = cert.subject.CN;
    } else if(req.headers['x-openhim-clientid']) {
      clientID = req.headers['x-openhim-clientid'];
    }

    if(!clientID) {
      return res.status(400).json({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "error",
          code: "processing",
          diagnostics: "Client ID not found"
        }],
        response: {
          status: 400
        }
      });
    }
    // if (config.get('mediator:register')) {
    //   clientID = req.headers['x-openhim-clientid'];
    // } else {
    //   const cert = req.connection.getPeerCertificate();
    //   clientID = cert.subject.CN;
    // }
    matchMixin.addPatient(clientID, patientsBundle, (error, responseBundle, responseHeaders, operationSummary) => {
      const auditBundle = matchMixin.createAddPatientAudEvent(operationSummary, req);
      fhirWrapper.saveResource({
        resourceData: auditBundle
      }, () => {
        logger.info('Audit saved successfully');
        let filteredResponseBundle = [];
        for(let entry of responseBundle.entry) {
          let exists = filteredResponseBundle.findIndex((fil) => {
            return fil.response.location.startsWith(entry.response.location.split('/_history')[0]);
          });
          if(exists === -1) {
            filteredResponseBundle.push(entry);
          } else {
            let replaceIndex = filteredResponseBundle.findIndex((fil) => {
              return parseInt(fil.response.etag) < parseInt(entry.response.etag) && fil.response.location.startsWith(entry.response.location.split('/_history')[0]);
            });
            if(replaceIndex !== -1) {
              filteredResponseBundle.splice(replaceIndex, 1);
              filteredResponseBundle.push(entry);
            }
          }
        }
        if (error) {
          res.status(500).json(filteredResponseBundle);
        } else {
          res.setHeader('Location', responseHeaders.patientID[0]);
          res.setHeader('LocationCRUID', responseHeaders.CRUID[0]);
          res.status(200).json(filteredResponseBundle);
        }

        let csvUploadAuditBundle = {
          resourceType: 'Bundle',
          type: 'batch',
          entry: []
        };
        async.eachSeries(operationSummary, (operSummary, nxtOper) => {
          matchMixin.createCSVUploadAudEvent(operSummary, csvUploadAuditBundle, req).then(() => {
            return nxtOper();
          }).catch(() => {
            return nxtOper();
          });
        }, () => {
          // matchMixin.saveCSVUploadAudiEvent(csvUploadAuditBundle).then(() => {
          //   csvUploadAuditBundle = {};
          // }).catch(() => {
          //   csvUploadAuditBundle = {};
          // });
        });

      });
    });
  }
}

module.exports = router;