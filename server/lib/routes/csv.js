'use strict';
/*global __dirname */
const express = require("express");
const router = express.Router();
const async = require('async');
const fs = require('fs');
const { nanoid } = require('nanoid');
const uuid5 = require('uuid/v5');
const ExcelJS = require('exceljs');
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
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary', {
    headerFooter:{firstHeader: "Import Summary", firstFooter: "Import Summary"}
  });
  const matchesSheet = workbook.addWorksheet('Matches', {
    headerFooter:{firstHeader: "Patients With Matches", firstFooter: "Patients With Matches"}
  });
  matchesSheet.columns = [
    { header: 'OpenCR_UID', key: 'uuid'},
    { header: 'last_modified', key: 'last_modified'},
    { header: 'source_id', key: 'source_id'},
    { header: 'patient_id', key: 'patient_id'},
    { header: 'names', key: 'names'},
    { header: 'sex', key: 'sex'},
    { header: 'dob', key: 'dob'},
    { header: 'telecom (phone)', key: 'phone'},
    { header: 'telecom (email)', key: 'email'},
    { header: 'address', key: 'address'},
    { header: 'ids', key: 'ids'},
    { header: 'threshold', key: 'threshold'},
    { header: 'score', key: 'score'},
    { header: 'OpenCR_UID', key: 'match_uuid'},
    { header: 'last_modified', key: 'match_last_modified'},
    { header: 'source_id', key: 'match_source_id'},
    { header: 'patient_id', key: 'match_patient_id'},
    { header: 'names', key: 'match_names'},
    { header: 'sex', key: 'match_sex'},
    { header: 'dob', key: 'match_dob'},
    { header: 'telecom (phone)', key: 'match_phone'},
    { header: 'telecom (email)', key: 'match_email'},
    { header: 'address', key: 'match_address'},
    { header: 'ids', key: 'match_ids'}
  ];
  const potentialSheet = workbook.addWorksheet('Potential Matches', {
    headerFooter:{firstHeader: "Patients With Potential Matches"}
  });
  potentialSheet.columns = [
    { header: 'OpenCR_UID', key: 'uuid'},
    { header: 'last_modified', key: 'last_modified'},
    { header: 'source_id', key: 'source_id'},
    { header: 'patient_id', key: 'patient_id'},
    { header: 'names', key: 'names'},
    { header: 'sex', key: 'sex'},
    { header: 'dob', key: 'dob'},
    { header: 'telecom (phone)', key: 'phone'},
    { header: 'telecom (email)', key: 'email'},
    { header: 'address', key: 'address'},
    { header: 'ids', key: 'ids'},
    { header: 'threshold', key: 'threshold'},
    { header: 'score', key: 'score'},
    { header: 'OpenCR_UID', key: 'potential_uuid'},
    { header: 'last_modified', key: 'potential_last_modified'},
    { header: 'source_id', key: 'potential_source_id'},
    { header: 'patient_id', key: 'potential_patient_id'},
    { header: 'names', key: 'potential_names'},
    { header: 'sex', key: 'potential_sex'},
    { header: 'dob', key: 'potential_dob'},
    { header: 'telecom (phone)', key: 'potential_phone'},
    { header: 'telecom (email)', key: 'potential_email'},
    { header: 'address', key: 'potential_address'},
    { header: 'ids', key: 'potential_ids'}
  ];
  const importedSheet = workbook.addWorksheet('Imported Patients', {
    headerFooter:{firstHeader: "Imported Patients"}
  });
  importedSheet.columns = [
    { header: 'OpenCR_UID', key: 'uuid'},
    { header: 'last_modified', key: 'last_modified'},
    { header: 'source_id', key: 'source_id'},
    { header: 'patient_id', key: 'patient_id'},
    { header: 'names', key: 'names'},
    { header: 'sex', key: 'sex'},
    { header: 'dob', key: 'dob'},
    { header: 'telecom (phone)', key: 'phone'},
    { header: 'telecom (email)', key: 'email'},
    { header: 'address', key: 'address'},
    { header: 'ids', key: 'ids'},
    { header: 'Sum of matches', key: 'total_matches'},
    { header: 'Sum of potential matches', key: 'total_potential'}
  ];
  let totalImported = 0;
  let totalPotential = 0;
  let totalMatches = 0;
  let totalPatientWithMatches = 0;
  let totalPatientWithPotential = 0;
  let id = req.params.id;
  fhirWrapper.getResource({
    resource: 'AuditEvent',
    id
  }, (auditEvent) => {
    if(auditEvent && auditEvent.resourceType === 'OperationOutcome') {
      return res.status(500).send();
    }
    let childrenEvents = auditEvent.extension && auditEvent.extension.filter((ext) => {
      return ext.url === 'http://openclientregistry.org/fhir/extension/csvauditreport';
    });
    if(!childrenEvents) {
      childrenEvents = [];
    }
    let queries = [];
    let query = '';
    for(let event of childrenEvents) {
      if(!query) {
        query = `_id=${event.valueReference.reference.split('/')[1]}`;
      } else {
        query += `,${event.valueReference.reference.split('/')[1]}`;
      }
      if(query.split(',').length >= 10) {
        queries.push(query);
        query = '';
      }
    }
    if(query) {
      queries.push(query);
    }

    async.eachSeries(queries, (query, nxt) => {
      fhirWrapper.getResource({
        resource: 'AuditEvent',
        query
      }, (auditEvents) => {
        for(let auditEvent of auditEvents.entry) {
          totalImported += auditEvent.resource.entity.length;
          writeDataToExcel(auditEvent.resource).then(() => {

          });
        }
        nxt();
      });
    }, () => {
      totalImported += auditEvent.entity.length;
      writeDataToExcel(auditEvent).then(() => {
        let row = summarySheet.getRow(1);
        summarySheet.mergeCells('A1:E1');
        row.getCell(1,5).value = 'Import Summary';
        row.style = {font:{bold: true, name: 'Comic Sans MS'}};
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.commit();

        row = summarySheet.getRow(2);
        row.getCell(1).value = 'Total Imported';
        row.getCell(2).value = totalImported;
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
        row.commit();

        row = summarySheet.getRow(2);
        summarySheet.addTable({
          name: 'MyTable',
          ref: 'A4',
          headerRow: true,
          style: {
            theme: 'TableStyleDark3',
            showRowStripes: false,
          },
          columns: [
            {name: 'Total matches', filterButton: false},
            {name: 'Total potential matches', filterButton: false},
          ],
          rows: [
            [totalMatches, totalPotential]
          ],
        });

        summarySheet.addTable({
          name: 'MyTable',
          ref: 'A7',
          headerRow: true,
          style: {
            theme: 'TableStyleDark3',
            showRowStripes: false,
          },
          columns: [
            {name: 'Total patients with matches', filterButton: false},
            {name: 'Total patients with potential matches'},
          ],
          rows: [
            [totalPatientWithMatches, totalPatientWithPotential],
          ],
        });
        if (!fs.existsSync(`${__dirname}/../../gui/tmp`)){
          fs.mkdirSync(`${__dirname}/../../gui/tmp`);
        }
        let fileName = `${__dirname}/../../gui/tmp/${id}-${nanoid(10)}.xlsx`;
        workbook.xlsx.writeFile(fileName).then(() => {
          res.send(fileName.replace(`${__dirname}/../../gui`, '/crux'));
          setTimeout(() => {
            fs.unlinkSync(fileName);
          }, 120000);
        });
      });
    });
  });

  function partialRow(patient, row, keyPref) {
    let sourceDetails = patient.meta && patient.meta.tag && patient.meta.tag.find((tag) => {
      return tag.system === 'http://openclientregistry.org/fhir/clientid';
    });
    let patientId = patient.identifier && patient.identifier.find((ident) => {
      return ident.system === 'http://openclientregistry.org/fhir/sourceid';
    });
    if(patient.meta && patient.meta.lastUpdated) {
      row[`${keyPref}last_modified`] = patient.meta.lastUpdated;
    } else {
      row[`${keyPref}last_modified`] = '';
    }

    if(sourceDetails && sourceDetails.code) {
      row[`${keyPref}source_id`] = sourceDetails.code;
    } else {
      row[`${keyPref}source_id`] = '';
    }

    if(patientId && patientId.value) {
      row[`${keyPref}patient_id`] = patientId.value;
    } else {
      row[`${keyPref}patient_id`] = '';
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
      row[`${keyPref}names`] = fullnames;
    } else {
      row[`${keyPref}names`] = '';
    }
    if(patient.gender) {
      row[`${keyPref}sex`] = patient.gender;
    } else {
      row[`${keyPref}sex`] = '';
    }

    if(patient.birthDate) {
      row[`${keyPref}dob`] = patient.birthDate;
    } else {
      row[`${keyPref}dob`] = '';
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
        row[`${keyPref}phone`] = phone;
      } else {
        row[`${keyPref}phone`] = '';
      }
      if(email) {
        row[`${keyPref}email`] = email;
      } else {
        row[`${keyPref}email`] = '';
      }
    } else {
      row[`${keyPref}email`] = '';
      row[`${keyPref}phone`] = '';
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
      row[`${keyPref}address`] = fullAddress;
      row.address = fullAddress;
    } else {
      row[`${keyPref}address`] = '';
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
      row[`${keyPref}ids`] = ids;
    } else {
      row[`${keyPref}ids`] = '';
    }
  }

  function writeDataToExcel(auditEvent) {
    return new Promise((resolve) => {
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
        matches = JSON.parse(matches.valueString);

        submittedPatient = JSON.parse(submittedPatient.valueString);

        //populate imported patients sheet
        let row = {};
        if(cruid) {
          row.uuid = cruid.valueString;
        } else {
          row.uuid = '';
        }
        partialRow(submittedPatient, row, '');
        row.total_matches = matches.autoMatches.length;
        row.total_potential = matches.potentialMatches.length;
        importedSheet.addRow(row);
        totalMatches += matches.autoMatches.length;
        totalPotential += matches.potentialMatches.length;
        if(matches.autoMatches.length > 0) {
          totalPatientWithMatches++;
          for(let auto of matches.autoMatches) {
            let row = {};
            if(cruid) {
              row.uuid = cruid.valueString;
            } else {
              row.uuid = '';
            }
            partialRow(submittedPatient, row, '');

            //threshold
            if(auto.threshold || auto.threshold === 0) {
              row.threshold = auto.threshold;
            } else {
              row.threshold = '';
            }

            //score
            if(auto.score || auto.score === 0) {
              row.score = auto.score;
            } else {
              row.score = auto.score;
            }

            //CRUID of automatches
            let link = auto.resource.link && auto.resource.link.find((link) => {
              return link.other && link.other.reference && link.type === 'refer';
            });
            if(link) {
              row.match_uuid = link.other.reference;
            } else {
              row.match_uuid = '';
            }

            partialRow(auto.resource, row, 'match_');
            matchesSheet.addRow(row);
          }
        }

        if(matches.potentialMatches.length > 0) {
          totalPatientWithPotential++;
          for(let potential of matches.potentialMatches) {
            let row = {};
            if(cruid) {
              row.uuid = cruid.valueString;
            } else {
              row.uuid = '';
            }
            partialRow(submittedPatient, row, '');

            //threshold
            if(potential.threshold || potential.threshold === 0) {
              row.threshold = potential.threshold;
            } else {
              row.threshold = '';
            }

            //score
            if(potential.score || potential.score === 0) {
              row.score = potential.score;
            } else {
              row.score = '';
            }

            //CRUID of potential matches
            let link = potential.resource.link && potential.resource.link.find((link) => {
              return link.other && link.other.reference && link.type === 'refer';
            });
            if(link) {
              row.potential_uuid = link.other.reference;
            } else {
              row.potential_uuid = '';
            }

            partialRow(potential.resource, row, 'potential_');
            potentialSheet.addRow(row);
          }
        }
      }
      resolve();
    });
  }
});

module.exports = router;