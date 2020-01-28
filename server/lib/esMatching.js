const request = require('request');
const URI = require('urijs');
const Fhir = require('fhir').Fhir;
const fhirWrapper = require('./fhir')();
const mixin = require('./mixin')
const logger = require('./winston');
const config = require('./config');
const matchingMixin = require('./matchingMixin')
const fhir = new Fhir();

const performMatch = ({
  sourceResource,
  ignoreList
}, callback) => {
  const decisionRules = config.get('rules');
  let esquery = {}
  esquery.query = {}
  esquery.query.bool = {}
  esquery.query.bool.must = []
  for (const ruleField in decisionRules) {
    const rule = decisionRules[ruleField];
    let match = {}
    match[rule.espath] = {}
    let pathValue = fhir.evaluate(sourceResource, rule.fhirpath)
    if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
      for (let value of pathValue) {
        match[rule.espath] = {
          query: value
        }
        if (rule.algorithm === "damerau-levenshtein" || rule.algorithm === "levenshtein") {
          match[rule.espath].fuzziness = rule.threshold
          if (rule.algorithm === "damerau-levenshtein") {
            match[rule.espath].fuzzy_transpositions = true
          } else {
            match[rule.espath].fuzzy_transpositions = false
          }
        }
        let tmpMatch = {
          ...match
        }
        esquery.query.bool.must.push({
          match: tmpMatch
        })
      }
    } else {
      if (!pathValue || (Array.isArray(pathValue) && (pathValue.length === 1 && pathValue[0] === undefined))) {
        pathValue = ''
      }
      if (typeof pathValue === "object" && Object.keys(pathValue).length === 0) {
        pathValue == ''
      }
      match[rule.espath] = {
        query: pathValue
      }
      if (rule.algorithm === "damerau-levenshtein" || rule.algorithm === "levenshtein") {
        match[rule.espath].fuzziness = rule.threshold
        if (rule.algorithm === "damerau-levenshtein") {
          match[rule.espath].fuzzy_transpositions = true
        } else {
          match[rule.espath].fuzzy_transpositions = false
        }
      }
      esquery.query.bool.must.push({
        match
      })
    }
  }

  let url = URI(config.get("elastic:server"))
    .segment(config.get("elastic:index"))
    .segment('_search')
    .toString();
  const options = {
    url,
    auth: {
      username: config.get("elastic:username"),
      password: config.get("elastic.password"),
    },
    json: esquery
  }
  let matches = {}
  matches.entry = []
  request.get(options, (err, res, body) => {
    fhirWrapper.getResource({
      resource: "Basic",
      id: config.get("structureDefinition:reportRelationship")
    }, (relationship) => {
      if (relationship) {
        let details = relationship.extension && relationship.extension.find(ext => ext.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportDetails');
        if (!details) {
          logger.error('Something is wrong with relationship ' + config.get("structureDefinition:reportRelationship"))
          return callback(matches)
        }
        let reportDetails = mixin.flattenComplex(details.extension);
        let reportName = reportDetails.name
        let query
        if (!body.hits || !body.hits.hits || !Array.isArray(body.hits.hits)) {
          logger.error(JSON.stringify(body, 0, 2))
          return callback(matches)
        }
        for (let hit of body.hits.hits) {
          let matchedId = hit["_source"][reportName]
          let id = matchedId.split("/").pop()
          if (ignoreList.includes(id)) {
            continue
          }
          let isBroken = matchingMixin.isMatchBroken(sourceResource, matchedId)
          if (query) {
            query += ',' + id
          } else {
            query = '_id=' + id
          }
          if (isBroken) {
            continue
          }
        }
        if (query) {
          fhirWrapper.getResource({
            resource: 'Patient',
            query
          }, (matches) => {
            matches.entry.concat(matches)
            return callback(matches)
          })
        } else {
          return callback(matches)
        }
      } else {
        return callback(matches)
      }
    })
  })
}

module.exports = {
  performMatch
}

// let sourceResource = {
//   "resourceType": "Patient",
//   "id": "5f64e716-f880-44ab-bada-7e78310d6c97",
//   "identifier": [{
//     "system": "http://clientregistry.org/dhis2",
//     "value": "997542"
//   }],
//   "active": true,
//   "name": [{
//     "use": "official",
//     "family": "Gideon",
//     "given": [
//       "Namalwa",
//       "Emanuel"
//     ]
//   }],
//   "gender": "male",
//   "birthDate": "1974-12-25"
// }
// let sourceResource = {
//   "resourceType": "Patient",
//   "id": "41ad1ed6-1cfa-42f3-a202-6dd4cbe5bc42",
//   "meta": {
//     "versionId": "2",
//     "lastUpdated": "2020-01-27T22:09:52.546+03:00",
//     "source": "#upPYbqEEtCROoKcb"
//   },
//   "text": {
//     "status": "generated",
//     "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><div class=\"hapiHeaderText\"/><table class=\"hapiPropertyTable\"><tbody><tr><td>Identifier</td><td>rec-3798-dup-0</td></tr></tbody></table></div>"
//   },
//   "identifier": [{
//       "system": "http://clientregistry.org/openmrs",
//       "value": "rec-3798-dup-0"
//     },
//     {
//       "system": "http://system1/nationalid",
//       "value": "CF46874076AVLZ"
//     },
//     {
//       "system": "http://system1/artnumber",
//       "value": "KUL-596214"
//     }
//   ],
//   "name": [{
//     "use": "official"
//   }],
//   "telecom": [{
//     "system": "phone",
//     "value": "774 234044"
//   }]
// }
// performMatch({
//   sourceResource,
//   ignoreList: []
// }, (matches) => {
//   logger.error(matches)
// })