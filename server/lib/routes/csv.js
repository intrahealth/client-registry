const express = require("express");
const router = express.Router();
const os = require('os');
const fs = require('fs');
const { nanoid } = require('nanoid');
const uuid5 = require('uuid/v5');
const fhirWrapper = require('../fhir')();
const logger = require('../winston');

router.get('/getCSVUpload', (req, res) => {
  fhirWrapper.getResource({
    resource: 'DocumentReference'
  }, (docRefs) => {
    logger.info('Received a request to get CSV report');
    let csvs = [];
    for(let docRef of docRefs.entry) {
      let csv = {};
      csv.uuid = docRef.resource.id;
      csv.reportId = uuid5(docRef.resource.id.toString(), '00b3ffab-450c-4407-9e59-05034a271da7');
      csv.name = docRef.resource.description;
      csv.date = docRef.resource.date;
      csvs.push(csv);
    }
    res.json(csvs);
  });
});

router.get('/getCSVReport/:id', (req, res) => {
  let id = req.params.id;
  fhirWrapper.getResource({
    resource: 'AuditEvent',
    id
  }, (auditEvent) => {
    if(auditEvent && auditEvent.resourceType === 'OperationOutcome') {
      return res.status(500).send();
    }
    let csvRows = 'OpenCR_UID,last_modified,source_id,patient_id,names,sex,dob,telecom (phone),telecom (email),address,ids,match_type,threshold,score,OpenCR_UID,last_modified,source_id,patient_id,names,sex,dob,telecom (phone),address,telecom (email),ids';
    for(let entity of auditEvent.entity) {
      let cruid = entity.detail.find((det) => {
        return det.type === 'CRUID';
      });
      let submittedPatient = entity.detail.find((det) => {
        return det.type === 'submittedPatient';
      });
      let matches = entity.detail.find((det) => {
        return det.type === 'match';
      });
      matches = Buffer.from(matches.valueBase64Binary, 'base64').toString('ascii');
      matches = JSON.parse(matches);

      submittedPatient = Buffer.from(submittedPatient.valueBase64Binary, 'base64').toString('ascii');
      submittedPatient = JSON.parse(submittedPatient);
      let primaryPatient = '';
      if(cruid) {
        primaryPatient = "\""+cruid.valueString+"\"";
      }
      primaryPatient += partialRow(submittedPatient);

      if(matches.autoMatches.length > 0) {
        for(let auto of matches.autoMatches) {
          csvRows += os.EOL;
          csvRows += primaryPatient + ',match';

          //threshold
          if(auto.threshold || auto.threshold === 0) {
            csvRows += "," + "\"" + auto.threshold + "\"";
          } else {
            csvRows += ',';
          }

          //score
          if(auto.score || auto.score === 0) {
            csvRows += "," + "\"" + auto.score + "\"";
          } else {
            csvRows += ',';
          }

          //CRUID of automatches
          let link = auto.resource.link && auto.resource.link.find((link) => {
            return link.other && link.other.reference && link.type === 'refer';
          });
          if(link) {
            csvRows += "," + "\"" + link.other.reference + "\"";
          } else {
            csvRows += ',';
          }

          csvRows += partialRow(auto.resource);
        }
      }

      if(matches.potentialMatches.length > 0) {
        for(let potential of matches.potentialMatches) {
          csvRows += os.EOL;
          //match type
          csvRows += primaryPatient + ',potential match';

          //threshold
          if(potential.threshold || potential.threshold === 0) {
            csvRows += "," + "\"" + potential.threshold + "\"";
          } else {
            csvRows += ',';
          }

          //score
          if(potential.score || potential.score === 0) {
            csvRows += "," + "\"" + potential.score + "\"";
          } else {
            csvRows += ',';
          }

          //CRUID of potential matches
          let link = potential.resource.link && potential.resource.link.find((link) => {
            return link.other && link.other.reference && link.type === 'refer';
          });
          if(link) {
            csvRows += "," + "\"" + link.other.reference + "\"";
          } else {
            csvRows += ',';
          }

          csvRows += partialRow(potential.resource);
        }
      }
      if(matches.potentialMatches.length === 0 && matches.autoMatches.length === 0) {
        csvRows += os.EOL;
        csvRows += primaryPatient;
      }
    }
    if (!fs.existsSync(`${__dirname}/../../gui/tmp`)){
      fs.mkdirSync(`${__dirname}/../../gui/tmp`);
    }
    let fileName = `${__dirname}/../../gui/tmp/${id}-${nanoid(10)}.csv`;
    fs.writeFileSync(fileName, csvRows);
    res.send(fileName.replace(`${__dirname}/../../gui`, '/crux'));
    setTimeout(() => {
      fs.unlinkSync(fileName);
    }, 120000);
  });

  function partialRow(patient) {
    let csvRow = '';
    let sourceDetails = patient.meta && patient.meta.tag && patient.meta.tag.find((tag) => {
      return tag.system === 'http://openclientregistry.org/fhir/clientid';
    });
    let patientId = patient.identifier && patient.identifier.find((ident) => {
      return ident.system === 'http://openclientregistry.org/fhir/sourceid';
    });
    if(patient.meta && patient.meta.lastUpdated) {
      csvRow = "," + "\""+patient.meta.lastUpdated + "\"";
    } else {
      csvRow = ",";
    }

    if(sourceDetails && sourceDetails.code) {
      csvRow += "," + "\""+sourceDetails.code+"\"";
    } else {
      csvRow += ",";
    }

    if(patientId && patientId.value) {
      csvRow += "," + "\""+patientId.value+"\"";
    } else {
      csvRow += ",";
    }

    if(Array.isArray(patient.name)) {
      let fullnames = '';
      for(let name of patient.name) {
        let nm = '';
        if(Array.isArray(name.given)) {
          for(let given of name.given) {
            if(!nm) {
              nm = given;
            } else {
              nm += ' ' + given;
            }
          }
        }
        if(name.family) {
          if(!nm) {
            nm = name.family;
          } else {
            nm += ' ' + name.family;
          }
        }
        if(!fullnames) {
          fullnames = nm;
        } else {
          fullnames += ', ' + nm;
        }
      }
      csvRow += "," + "\""+fullnames+"\"";
    } else {
      csvRow += ',';
    }
    if(patient.gender) {
      csvRow += "," + "\""+patient.gender+"\"";
    } else {
      csvRow += ',';
    }

    if(patient.birthDate) {
      csvRow += "," + "\""+patient.birthDate+"\"";
    } else {
      csvRow += ',';
    }

    if(Array.isArray(patient.telecom)) {
      let phone = '';
      let email = '';
      for(let telecom of patient.telecom) {
        if(telecom.system === 'phone' && telecom.value) {
          if(!phone) {
            phone = telecom.value;
          } else {
            phone += ', '+ telecom.value;
          }
        }
        if(telecom.system === 'email' && telecom.value) {
          if(!email) {
            email = telecom.value;
          } else {
            email += ', ' + telecom.value;
          }
        }
      }
      if(phone) {
        csvRow += "," + "\""+phone+"\"";
      } else {
        csvRow += ',';
      }
      if(email) {
        csvRow += "," + "\""+email+"\"";
      } else {
        csvRow += ',';
      }
    } else {
      csvRow += ',,';
    }

    if(Array.isArray(patient.address)) {
      let fullAddress = '';
      for(let address of patient.address) {
        let add = '';
        if(address.type) {
          add += address.type;
        }
        if(address.text) {
          if(!add) {
            add = address.text;
          } else {
            add += ', ' + address.text;
          }
        }
        if(Array.isArray(address.line)) {
          if(!add) {
            add = address.line.join(', ');
          } else {
            add += ', ' + address.line.join(', ');
          }
        }
        if(address.city) {
          if(!add) {
            add = address.city;
          } else {
            add += ', ' + address.city;
          }
        }
        if(address.district) {
          if(!add) {
            add = address.district;
          } else {
            add += ', ' + address.district;
          }
        }
        if(address.state) {
          if(!add) {
            add = address.state;
          } else {
            add += ', ' + address.state;
          }
        }
        if(address.postalCode) {
          if(!add) {
            add = address.postalCode;
          } else {
            add += ', ' + address.postalCode;
          }
        }
        if(address.country) {
          if(!add) {
            add = address.country;
          } else {
            add += ', ' + address.country;
          }
        }

        if(fullAddress) {
          fullAddress += ' | ' + add;
        } else {
          fullAddress = add;
        }
      }
      csvRow += "," + "\""+fullAddress+"\"";
    } else {
      csvRow += ',';
    }

    if(Array.isArray(patient.identifier)) {
      let ids = '';
      for(let ident of patient.identifier) {
        if(ident.value) {
          if(!ids) {
            ids = ident.value;
          } else {
            ids += ', ' + ident.value;
          }
        }
      }
      csvRow += "," + "\""+ids+"\"";
    } else {
      csvRow += ',';
    }
    return csvRow;
  }
});

module.exports = router;