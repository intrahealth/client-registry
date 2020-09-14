'use strict';
const request = require('request');
const URI = require('urijs');
const async = require('async');
const _ = require('lodash');
const Fhir = require('fhir').Fhir;
const fhirWrapper = require('./fhir')();
const logger = require('./winston');
const config = require('./config');
const generalMixin = require('./mixins/generalMixin');
const fhir = new Fhir();

const refreshIndex = (callback) => {
  console.time('Refresh');
  logger.info('Refreshing index ' + config.get('elastic:index'));
  const url = URI(config.get('elastic:server'))
    .segment(config.get('elastic:index'))
    .segment('_refresh')
    .toString();
  const options = {
    url,
    auth: {
      username: config.get('elastic:username'),
      password: config.get('elastic.password'),
    }
  };
  request.post(options, (err, res, body) => {
    if (err) {
      logger.error('Error Occured');
      logger.error(err);
      return callback();
    }
    logger.info('Index ' + config.get('elastic:index') + ' refreshed');
    console.timeEnd('Refresh');
    return callback();
  });
};

const generatePrimes = (total) => {
  const primeArray = [];
  let count = 0;
  let currentNum = 2;
  while (count < total) {
    if (_isPrime(currentNum)) {
      primeArray.push(currentNum);
      count++;
    }
    currentNum++;
  }
  return primeArray;

  function _isPrime(num) {
    if (num <= 1) {
      throw new Error("Number cannot be smaller than 2");
    }
    var status = true;
    if (num !== 2 && num % 2 === 0) {
      status = false;
    } else {
      for (var i = 2; i < num; ++i) {
        if (num % i == 0) {
          status = false;
          break;
        }
      }
    }
    return status;
  }
};

const buildDeterministicQuery = (sourceResource, decisionRule) => {
  const esquery = {};
  esquery.query = {};
  esquery.query.bool = {};
  esquery.query.bool.must = [];
  for (const ruleField in decisionRule.fields) {
    const rule = decisionRule.fields[ruleField];
    const match = {};
    let path = rule.espath;
    if (rule.algorithm === 'phonetic') {
      path += '.phonetic';
    }
    let pathValue = fhir.evaluate(sourceResource, rule.fhirpath);
    const values = [];
    if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
      if (pathValue.length === 0) {
        values.push("");
      }
      for (const value of pathValue) {
        values.push(value);
      }
    } else {
      if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
        pathValue = "";
      }
      if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
        pathValue == "";
      }
      values.push(pathValue);
    }

    // for(const value of values) {
    const value = values.join(" ");
    if (rule.algorithm === 'jaro-winkler') {
      esquery.query.bool.must.push({
        script: {
          script: {
            id: 'jaro-winkler',
            params: {
              field: path,
              threshold: rule.threshold,
              value,
              ignoreCase: true,
              maxPrefix: 4,
              scalingFactor: 0.1
            }
          }
        }
      });
    } else {
      match[path] = {
        query: value,
      };
      if (rule.weight > 0) {
        match[path].boost = rule.weight;
      }
      if (rule.algorithm === 'damerau-levenshtein' || rule.algorithm === 'levenshtein') {
        match[path].fuzziness = rule.threshold;
        if (rule.algorithm === 'damerau-levenshtein') {
          match[path].fuzzy_transpositions = true;
        } else {
          match[path].fuzzy_transpositions = false;
        }
      }
      const tmpMatch = _.cloneDeep(match);
      esquery.query.bool.must.push({
        match: tmpMatch,
      });
    }
    // }
  }
  if (decisionRule.filters && Object.keys(decisionRule.filters).length > 0) {
    esquery.query.bool.filter = [];
    for (const filterField in decisionRule.filters) {
      const block = decisionRule.filters[filterField];
      const term = {};
      const path = block.espath;
      let pathValue = fhir.evaluate(sourceResource, block.fhirpath);
      if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
        if (pathValue.length === 0) {
          term[path] = '';
          esquery.query.bool.filter.push({
            term
          });
        }
        for (const value of pathValue) {
          term[path] = value;
          const tmpTerm = _.cloneDeep(term);
          esquery.query.bool.filter.push({
            term: tmpTerm,
          });
        }
      } else {
        if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
          pathValue = '';
        }
        if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
          pathValue == '';
        }
        term[path] = pathValue;
        esquery.query.bool.filter.push({
          term,
        });
      }
    }
  }
  return esquery;
};

const buildProbabilisticQuery = (sourceResource, decisionRule) => {
  const esquery = {};
  esquery.query = {};
  esquery.query = {
    script_score: {
      query: {
        function_score: {
          query: {},
          functions: []
        }
      }
    }
  };
  const primes = generatePrimes(Object.keys(decisionRule.fields).length);
  let index = 0;
  for (const ruleField in decisionRule.fields) {
    const rule = decisionRule.fields[ruleField];
    const esfunction = {
      filter: {}
    };
    esfunction.weight = primes[index];
    index++;
    let path = rule.espath;
    if (rule.algorithm === 'phonetic') {
      path += '.phonetic';
    }
    const values = [];
    esfunction.filter.match = {};
    let pathValue = fhir.evaluate(sourceResource, rule.fhirpath);
    if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
      if (pathValue.length === 0) {
        values.push("");
      }
      for (const value of pathValue) {
        values.push(value);
      }
    } else {
      if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
        pathValue = '';
      }
      if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
        pathValue == '';
      }
      values.push(pathValue);
    }

    // for(const value of values) {
    const value = values.join(" ");
    if (rule.algorithm === 'jaro-winkler') {
      esfunction.filter.script = {
        script: {
          id: 'jaro-winkler',
          params: {
            field: path,
            value
          }
        }
      };
      delete esfunction.filter.match;
    } else {
      esfunction.filter.match[path] = {
        query: value
      };
      if (rule.algorithm === 'damerau-levenshtein' || rule.algorithm === 'levenshtein') {
        esfunction.filter.match[path].fuzziness = rule.threshold;
        if (rule.algorithm === 'damerau-levenshtein') {
          esfunction.filter.match[path].fuzzy_transpositions = true;
        } else {
          esfunction.filter.match[path].fuzzy_transpositions = false;
        }
      }
    }
    const tmpESFunction = _.cloneDeep(esfunction);
    esquery.query.script_score.query.function_score.functions.push(tmpESFunction);
    // }
  }

  if (!decisionRule.filters || Object.keys(decisionRule.filters).length === 0) {
    esquery.query.script_score.query.function_score.query = {
      match_all: {}
    };
  }

  if (decisionRule.filters && Object.keys(decisionRule.filters).length > 0) {
    esquery.query.script_score.query.function_score.query.bool = {
      filter: []
    };
    for (const filterField in decisionRule.filters) {
      const block = decisionRule.filters[filterField];
      const term = {};
      const path = block.espath;
      let pathValue = fhir.evaluate(sourceResource, block.fhirpath);
      if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
        if (pathValue.length === 0) {
          term[path] = {
            value: ''
          };
          esquery.query.script_score.query.function_score.query.bool.filter.push({
            term
          });
        }
        for (const value of pathValue) {
          term[path] = {
            value
          };
          const tmpTerm = _.cloneDeep(term);
          esquery.query.script_score.query.function_score.query.bool.filter.push({
            term: tmpTerm,
          });
        }
      } else {
        if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
          pathValue = '';
        }
        if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
          pathValue == '';
        }
        term[path] = {
          value: pathValue
        };
        esquery.query.script_score.query.function_score.query.bool.filter.push({
          term
        });
      }
    }
  }
  esquery.query.script_score.query.function_score.score_mode = 'multiply';
  esquery.query.script_score.query.function_score.boost_mode = 'replace';
  esquery.query.script_score.query.function_score.min_score = 2;
  index = 0;
  const params = {
    fields: []
  };
  for (const ruleField in decisionRule.fields) {
    const rule = decisionRule.fields[ruleField];
    const match = Math.log(parseFloat(rule.mValue) / parseFloat(rule.uValue));
    const unmatch = Math.log((1 - parseFloat(rule.mValue)) / (1 - parseFloat(rule.uValue)));
    params.fields.push({
      prime: primes[index],
      match,
      unmatch
    });
    index++;
  }
  esquery.query.script_score.script = {
    "source": "double result = 0.0;for( item in params.fields ) {result += ( _score % item.prime == 0 ?item.match : item.unmatch );}return result;",
    params
  };
  esquery.query.script_score.min_score = decisionRule.threshold;
  return esquery;
};

const performMatch = ({
  sourceResource,
  ignoreList
}, callback) => {
  logger.info('Finding matches for patient ' + JSON.stringify(sourceResource.identifier, 0, 2));
  let error = false;
  let maxScore;
  let resourceID; //ID of a matched resource that has the highest score
  const ESMatches = [];
  const FHIRMatches = {
    entry: []
  };
  refreshIndex(() => {
    const decisionRules = config.get('rules');
    async.eachSeries(decisionRules, (decisionRule, nxtRule) => {
      let esquery = {};
      if (decisionRule.matchingType === 'probabilistic') {
        esquery = buildProbabilisticQuery(sourceResource, decisionRule);
      } else if (decisionRule.matchingType === 'deterministic') {
        esquery = buildDeterministicQuery(sourceResource, decisionRule);
      } else {
        logger.error('Matching type is not specified under decision rule, should be either deterministic or probabilistic');
        return callback(true);
      }
      logger.error(JSON.stringify(esquery, 0, 2));
      const url = URI(config.get('elastic:server'))
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
        if (!body.hits || !body.hits.hits || !Array.isArray(body.hits.hits)) {
          logger.error(JSON.stringify(body, 0, 2));
          return nxtRule();
        }
        const hits = [];
        for (const hit of body.hits.hits) {
          const id = hit['_id'];
          if (ignoreList.includes(id)) {
            continue;
          }
          const isBroken = generalMixin.isMatchBroken(sourceResource, `Patient/${id}`);
          if (isBroken) {
            continue;
          }
          hits.push(hit);

          // take the one with the highest score
          const score = parseFloat(hit['_score']);
          if (score > parseFloat(maxScore) || !maxScore) {
            resourceID = id;
            maxScore = score;
          }
        }
        ESMatches.push({
          rule: decisionRule,
          results: hits,
          query: esquery
        });
        return nxtRule();
      });
    }, () => {
      if (resourceID) {
        let query;
        for (const esmatched of ESMatches) {
          for (const res of esmatched.results) {
            if (!query) {
              query = '_id=' + res['_id'];
            } else {
              query += ',' + res['_id'];
            }
          }
        }
        if (!query) {
          logger.error('An expected error has occured, cant pull FHIR resources from ' + ESMatches);
          error = true;
          return callback(error);
        }
        query += '&_include=Patient:link';
        fhirWrapper.getResource({
          resource: 'Patient',
          query,
          noCaching: true
        }, (resourceData) => {
          const goldenRecords = {
            entry: []
          };
          goldenRecords.entry = resourceData.entry.filter((entry) => {
            return entry.search.mode === 'include';
          });
          const results = {
            entry: []
          };
          results.entry = resourceData.entry.filter((entry) => {
            return entry.search.mode === 'match';
          });
          // get golden id of the resource that had higher score
          let goldenID;
          for (const entry of results.entry) {
            if (entry.resource.id === resourceID) {
              if (entry.resource.link && Array.isArray(entry.resource.link) && entry.resource.link.length > 0) {
                goldenID = entry.resource.link[0].other.reference;
              }
            }
          }
          // remove any other matched resources that has different golden id than the one with highest score
          FHIRMatches.entry = results.entry.filter((entry) => {
            return entry.resource.link.find((link) => {
              return link.other.reference === goldenID;
            });
          });

          goldenRecords.entry = goldenRecords.entry.filter((entry) => {
            return entry.resource.resourceType + '/' + entry.resource.id === goldenID;
          });

          for (const index in ESMatches) {
            ESMatches[index].results = ESMatches[index].results.filter((results) => {
              return FHIRMatches.entry.find((entry) => {
                return entry.resource.id === results['_id'];
              });
            });
          }
          logger.info('Done matching');
          return callback(error, FHIRMatches, ESMatches, goldenRecords);
        });
      } else {
        logger.info('Done matching');
        return callback(error, FHIRMatches, ESMatches, []);
      }
    });
  });
};

module.exports = {
  performMatch,
  refreshIndex
};