'use strict';
const request = require('request');
const URI = require('urijs');
const async = require('async');
const Fhir = require('fhir').Fhir;
const fhirWrapper = require('./fhir')();
const logger = require('./winston');
const config = require('./config');
const matchingMixin = require('./matchingMixin');
const fhir = new Fhir();

const performMatch = ({
  sourceResource,
  ignoreList
}, callback) => {
  let matches = {};
  matches.entry = [];
  const decisionRules = config.get('rules');
  async.eachSeries(decisionRules, (decisionRule, nxtRule) => {
    let esquery = {};
    esquery.query = {};
    esquery.query.bool = {};
    esquery.query.bool.must = [];
    for (const ruleField in decisionRule) {
      const rule = decisionRule[ruleField];
      let match = {};
      let path = rule.espath;
      if (rule.algorithm === 'phonetic') {
        path += '.phonetic';
      }
      let pathValue = fhir.evaluate(sourceResource, rule.fhirpath);
      if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
        if (pathValue.length === 0) {
          match[path] = {
            query: '',
          };
          esquery.query.bool.must.push({
            match: match,
          });
        }
        for (let value of pathValue) {
          match[path] = {
            query: value,
          };
          if (rule.algorithm === 'damerau-levenshtein' || rule.algorithm === 'levenshtein') {
            match[path].fuzziness = rule.threshold;
            if (rule.algorithm === 'damerau-levenshtein') {
              match[path].fuzzy_transpositions = true;
            } else {
              match[path].fuzzy_transpositions = false;
            }
          }
          let tmpMatch = {
            ...match,
          };
          esquery.query.bool.must.push({
            match: tmpMatch,
          });
        }
      } else {
        if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
          pathValue = '';
        }
        if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
          pathValue == '';
        }
        match[path] = {
          query: pathValue,
        };
        if (rule.algorithm === 'damerau-levenshtein' || rule.algorithm === 'levenshtein') {
          match[path].fuzziness = rule.threshold;
          if (rule.algorithm === 'damerau-levenshtein') {
            match[path].fuzzy_transpositions = true;
          } else {
            match[path].fuzzy_transpositions = false;
          }
        }
        esquery.query.bool.must.push({
          match,
        });
      }
    }
    let url = URI(config.get('elastic:server'))
      .segment(config.get('elastic:index'))
      .segment('_search')
      .toString();
    const options = {
      url,
      auth: {
        username: config.get('elastic:username'),
        password: config.get('elastic.password'),
      },
      json: esquery,
    };
    request.get(options, (err, res, body) => {
      let query;
      if (!body.hits || !body.hits.hits || !Array.isArray(body.hits.hits)) {
        logger.error(JSON.stringify(body, 0, 2));
        return nxtRule();
      }
      if (body.hits.hits.length === 0) {
        return nxtRule();
      }
      for (let hit of body.hits.hits) {
        let id = hit['_id'];
        if (ignoreList.includes(id)) {
          continue;
        }
        let isBroken = matchingMixin.isMatchBroken(sourceResource, `Patient/${id}`);
        if (isBroken) {
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
        }, matches => {
          matches.entry.concat(matches);
          return nxtRule();
        });
      } else {
        return nxtRule();
      }
    });
  }, () => {
    return callback(matches);
  });
};

module.exports = {
  performMatch,
};

// let sourceResource = {
//   resourceType: 'Patient',
//   id: '5f64e716-f880-44ab-bada-7e78310d6c97',
//   identifier: [{
//     system: 'http://clientregistry.org/dhis2',
//     value: '997542',
//   }, ],
//   active: true,
//   name: [{
//     use: 'official',
//     family: 'Gideon',
//     given: ['Namalwa', 'Emanuel'],
//   }, ],
//   telecom: [{
//     system: 'phone',
//     value: '774 234044',
//   }],
//   gender: 'male',
//   birthDate: '1974-12-25',
// };
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
//     sourceResource,
//     ignoreList: [],
//   },
//   matches => {
//     logger.error(matches);
//   }
// );