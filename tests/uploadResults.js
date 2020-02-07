'use strict';
const fs = require('fs');
const csv = require('fast-csv');
const path = require('path');
const async = require('async');
const jsoncsv = require('json-csv');
const moment = require('moment')
const logger = require('../server/lib/winston');
const fhirWrapper = require('../server/lib/fhir')();
const config = require('../server/lib/config');

let noMatches = [];
let missing = [];

const allLinks = [];
const linkedToAllTrueAndOthers = [];
const linkedToAllTrueOnly = [];
const linkedToSomeTrue = [];
const hasMatchesButNoTrue = [];
const expectedToMatchButNoMatch = []
const notExpectedToMatchButMatched = [];
const notExpectedToMatchAndDidntMatch = []
let trueLinks = [];

const modifyCSV = () => {
  let copy = []
  for (let trueLink of trueLinks) {
    let id1 = trueLink.rec_id_1;
    let id2 = trueLink.rec_id_2;
    if (id1) {
      id1 = id1.trim();
    }
    let id2Arr = [];
    if (id2) {
      id2 = id2.trim();
      id2Arr = id2.split(',');
      for (let index in id2Arr) {
        id2Arr[index] = id2Arr[index].trim();
      }
      id2Arr.unshift(id1)
      for (let index in id2Arr) {
        let newId1 = id2Arr[index]
        let subId2Arr = id2Arr.slice(parseInt(index) + 1)
        for (let newId2 of subId2Arr) {
          copy.push({
            rec_id_1: newId1,
            rec_id_2: newId2
          })
          copy.push({
            rec_id_1: newId2,
            rec_id_2: newId1
          })
        }
      }
    }
  }
  trueLinks = copy
}
const getPatientLinks = (patient, dbPatients, callback) => {
  let patientLinksData = []
  if (!patient.link || !Array.isArray(patient.link) || (patient.link && patient.link.length === 0)) {
    return callback(patientLinksData)
  }
  if (dbPatients.entry && dbPatients.entry.length > 0) {
    for (let link of patient.link) {
      for (let dbPatient of dbPatients.entry) {
        if ('Patient/' + dbPatient.resource.id === link.other.reference) {
          for (let link2 of dbPatient.resource.link) {
            let foundLinks = dbPatients.entry.filter((entry) => {
              return 'Patient/' + entry.resource.id === link2.other.reference && entry.resource.id != patient.id
            })
            if (foundLinks) {
              patientLinksData = patientLinksData.concat(foundLinks)
            }
          }
        }
      }
    }
    return callback(patientLinksData)
  } else {
    return callback(patientLinksData)
  }
}
const getTrueLinksById = (id1) => {
  let ids = trueLinks.filter((trueLink) => {
    return trueLink.rec_id_1 === id1
  })
  let id2 = []
  for (let id of ids) {
    id2.push(id.rec_id_2)
  }
  return id2
}
const decisionRules2HTML = () => {
  const decisionRules = config.get('rules');
  let table =
    `<table border='1' cellspacing='0'>
    <tr>
      <th>#</th><th>Field</th><th>Algorithm</th><th>Threshold</th>
    </tr>`
  let counter = 1
  for (let decisionRule of decisionRules) {
    let totalFields = Object.keys(decisionRule).length
    let tr = `<tr><td rowspan=${totalFields}>${counter}</td>`
    let innerCounter = 1;
    for (const ruleField in decisionRule) {
      if (innerCounter > 1) {
        tr = `<tr>`
      }
      const rule = decisionRule[ruleField];
      let threshold
      if (!rule.threshold) {
        threshold = '-'
      } else {
        threshold = rule.threshold
      }
      tr += `<td>${ruleField}</td><td>${rule.algorithm}</td><td>${threshold}</td>`
      tr += `</tr>`
      table += tr
      innerCounter++
    }
    counter++
  }
  table += `</table>`
  return table
}
const arraysEqual = (array1, array2) => {
  if (array1.length != array2.length) {
    return false;
  }
  let hasAll = true;
  for (let arr1 of array1) {
    if (!array2.includes(arr1)) {
      hasAll = false;
    }
  }
  return hasAll;
};
const expectedToMatch = (checkingID) => {
  let expected = trueLinks.find((trueLink) => {
    return trueLink.rec_id_1 === checkingID
  })
  return expected
}
const uploadResults = (csvFile) => {
  fs.createReadStream(path.resolve(__dirname, '', csvFile))
    .pipe(
      csv.parse({
        headers: true,
      })
    )
    .on('error', error => console.error(error))
    .on('data', row => {
      trueLinks.push(row);
    })
    .on('end', () => {
      modifyCSV()
      const processed = [];
      fhirWrapper.getResource({
        resource: 'Patient',
      }, dbPatients => {
        async.parallel({
          allLinks: callback => {
            const promises = [];
            for (let patient of dbPatients.entry) {
              promises.push(new Promise(resolve => {
                const isGoldenRec = patient.resource.meta && patient.resource.meta.tag && patient.resource.meta.tag.find((tag) => {
                  return tag.code === config.get('codes:goldenRecord');
                });
                if (isGoldenRec) {
                  return resolve()
                }
                getPatientLinks(patient.resource, dbPatients, (patientLinksData) => {
                  let linkedid1;
                  for (let ident of patient.resource.identifier) {
                    if (ident.system === 'http://clientregistry.org/openmrs') {
                      linkedid1 = ident.value;
                    }
                  }
                  if (patientLinksData.length === 0) {
                    let expected = expectedToMatch(linkedid1)
                    if (!expected) {
                      notExpectedToMatchAndDidntMatch.push({
                        id1: linkedid1
                      })
                    }
                    noMatches.push({
                      id1: linkedid1
                    });
                    return resolve();
                  }
                  let linkedIds2 = [];
                  for (let linkedPatient of patientLinksData) {
                    if (!linkedPatient.resource.identifier) {
                      noIdentifier.push(linkedPatient);
                    } else {
                      let id2;
                      for (let ident of linkedPatient.resource.identifier) {
                        if (ident.system === 'http://clientregistry.org/openmrs') {
                          id2 = ident.value;
                        }
                      }
                      linkedIds2.push(id2);
                    }
                  }
                  let expected = expectedToMatch(linkedid1)
                  if (!expected) {
                    notExpectedToMatchButMatched.push({
                      id1: linkedid1,
                      id2: linkedIds2.join(', '),
                    });
                  }
                  let combinedId = [...[linkedid1], ...linkedIds2];
                  let isProcessed = processed.find(pr => {
                    return arraysEqual(pr, combinedId);
                  });
                  if (!isProcessed) {
                    processed.push(combinedId);
                    allLinks.push({
                      id1: linkedid1,
                      id2: linkedIds2.join(', '),
                    });
                  }
                  resolve();
                })
              }));
            }
            Promise.all(promises).then(() => {
              return callback(null);
            });
          },
          one: callback => {
            const promises = [];
            const processed = [];
            for (let row of trueLinks) {
              let isProcessed = processed.find((id) => {
                return id === row.rec_id_1
              })
              if (isProcessed) {
                continue
              } else {
                processed.push(row.rec_id_1)
              }
              promises.push(new Promise((resolve, reject) => {
                let trueId1 = row['rec_id_1'];
                if (trueId1) {
                  trueId1 = trueId1.trim();
                }
                let fhirRecord = dbPatients.entry.find((entry) => {
                  return entry.resource.identifier && entry.resource.identifier.find((identifier) => {
                    return identifier.value === trueId1
                  })
                })
                if (!fhirRecord) {
                  logger.error('Missing value found');
                  missing.push(trueId1);
                  resolve();
                } else {
                  getPatientLinks(fhirRecord.resource, dbPatients, (patientLinksData) => {
                    if (patientLinksData.length === 0) {
                      // expected to have match but no match found
                      expectedToMatchButNoMatch.push({
                        id1: trueId1
                      })
                      resolve();
                    } else {
                      let linkedIds2 = [];
                      for (let linkedPatient of patientLinksData) {
                        if (!linkedPatient.resource.identifier) {
                          noIdentifier.push(linkedPatient);
                        } else {
                          for (let ident of linkedPatient.resource.identifier) {
                            if (ident.system === 'http://clientregistry.org/openmrs') {
                              linkedIds2.push(ident.value);
                            }
                          }
                        }
                      }
                      let allFound = true;
                      let someFound = false;
                      let allTrueId2 = getTrueLinksById(trueId1)
                      for (let trueId2 of allTrueId2) {
                        let has = linkedIds2.includes(trueId2);
                        if (!has) {
                          allFound = false;
                        } else {
                          someFound = true;
                        }
                      }
                      if (allFound && linkedIds2.length === allTrueId2.length) {
                        linkedToAllTrueOnly.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (allFound && linkedIds2.length > allTrueId2.length) {
                        linkedToAllTrueAndOthers.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (someFound && !allFound) {
                        linkedToSomeTrue.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      if (!someFound) {
                        hasMatchesButNoTrue.push({
                          id1: trueId1,
                          id2: linkedIds2.join(', '),
                        });
                      }
                      resolve();
                    }
                  })
                }
              }));
            }
            Promise.all(promises).then(() => {
              return callback(null);
            });
          },
        }, () => {
          let fields1 = [{
              name: 'id1',
              label: 'ID1',
            },
            {
              name: 'id2',
              label: 'ID2',
            }
          ];
          let date = moment().format('Y-MM-DDTHH:mm:ss')
          jsoncsv.buffered(allLinks, {
            fields: fields1
          }, (err, csv) => {
            fs.writeFile(`results/allLinks_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(linkedToAllTrueOnly, {
            fields: fields1
          }, (err, csv) => {
            fs.writeFile(`results/Linked_to_all_true_matches_only_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(linkedToAllTrueAndOthers, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/Linked_to_all_the_true_matches_and_other_unexpected_matches_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(linkedToSomeTrue, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/Linked_to_atleast_one_true_matches_but_not_all_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(
            hasMatchesButNoTrue, {
              fields: fields1,
            }, (err, csv) => {
              fs.writeFile(`results/Linked_to_some_matches_but_excluding_the_true_match_${date}.csv`, csv, 'utf8', () => {});
            }
          );

          jsoncsv.buffered(notExpectedToMatchButMatched, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/Didnt_expect_to_have_matches_but_match_found_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(expectedToMatchButNoMatch, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/Expected_to_have_matches_but_matched_nothing_${date}.csv`, csv, 'utf8', () => {});
          });

          jsoncsv.buffered(noMatches, {
            fields: fields1,
          }, (err, csv) => {
            fs.writeFile(`results/All_no_matches_${date}.csv`, csv, 'utf8', () => {});
          });

          let TP = linkedToAllTrueOnly.length
          let FP = linkedToAllTrueAndOthers.length + notExpectedToMatchButMatched.length + hasMatchesButNoTrue.length
          let TN = notExpectedToMatchAndDidntMatch.length
          let FN = linkedToSomeTrue.length + expectedToMatchButNoMatch.length
          let sensitivity = TP / (TP + FN)
          if (TP == 0) {
            sensitivity = 0
          }
          let specifity = TN / (TN + FP)
          if (TN == 0) {
            specifity = 0
          }

          let precision = TP / (TP + FP)
          if (TP === 0) {
            precision = 0
          }
          let F1Score = (precision * sensitivity) / (precision + sensitivity)
          F1Score = F1Score * 2
          if (precision * sensitivity === 0) {
            F1Score = 0
          }
          let resultsTable =
            `<table border='1' cellspacing='0'>
            <tr>
              <th>True Positive (TP)</th><th>False Positive (FP)</th><th>True Negative (TN)</th><th>False Negative (FN)</th>
            </tr>
            <tr>
              <td>${TP}</td><td>${FP}</td><td>${TN}</td><td>${FN}</td>
            </tr>
          </table>`
          let rules = decisionRules2HTML()
          let matchDiagnostics =
            `<table border='1' cellspacing='0'>
            <tr>
              <th>Sensitivity</th><th>Specifity</th><th>Precision</th></th><th>F1 Score</th>
            </tr>
            <tr>
              <td>${sensitivity.toFixed(2)}</td><td>${specifity.toFixed(2)}</td><td>${precision.toFixed(2)}</td><td>${F1Score.toFixed(2)}</td>
            </tr>
          </table>`
          let table =
            `<table border='3' border='1' cellspacing='0' cellpadding='10'>
            <tr>
              <th><center> <b>Run Date ${date}</b></center></th>
            </tr>
            <tr>
              <td><center><b>Decision Rules</b>${rules}</center></td>
            </tr>
            <tr>
              <td><center><b>Match Diagnostics</b><br>${matchDiagnostics}</center></td>
            </tr>
            <tr>
              <td><center><b>Match Results</b><br>${resultsTable}</center></td>
            </tr>
          </table>`
          fs.readFile('README.md', (err, existingResData) => {
            let resData = table + "<br>" + existingResData
            fs.writeFile('README.md', resData, 'utf8', () => {})
          })
        });
      })
    });
}
module.exports = {
  uploadResults
}
//uploadResults('./uganda_data_v21_20201501_true_links.csv')