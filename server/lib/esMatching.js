'use strict';
const request = require('request');
const URI = require('urijs');
const async = require('async');
const _ = require('lodash');
const Fhir = require('fhir').Fhir;
const fhirWrapper = require('./fhir')();
const logger = require('./winston');
const config = require('./config');
const matchingMixin = require('./matchingMixin');
const fhir = new Fhir();

const generatePrimes = (total) => {
  const primeArray=[];
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
    if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
      if (pathValue.length === 0) {
        match[path] = {
          query: '',
        };
        if(rule.weight > 0) {
          match[path].boost = rule.weight;
        }
        esquery.query.bool.must.push({
          match: match,
        });
      }
      for (const value of pathValue) {
        match[path] = {
          query: value,
        };
        if(rule.weight > 0) {
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
      if(rule.weight > 0) {
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
      esquery.query.bool.must.push({
        match,
      });
    }
  }
  if (Object.keys(decisionRule.filters).length > 0) {
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
    esfunction.filter.match = {};
    let pathValue = fhir.evaluate(sourceResource, rule.fhirpath);
    if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
      if (pathValue.length === 0) {
        esfunction.filter.match[path] = {
          query: ''
        };
        esquery.query.script_score.query.function_score.functions.push(esfunction);
      }
      for (const value of pathValue) {
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
        const tmpESFunction = _.cloneDeep(esfunction);
        esquery.query.script_score.query.function_score.functions.push(tmpESFunction);
      }
    } else {
      if (!pathValue || (Array.isArray(pathValue) && pathValue.length === 1 && pathValue[0] === undefined)) {
        pathValue = '';
      }
      if (typeof pathValue === 'object' && Object.keys(pathValue).length === 0) {
        pathValue == '';
      }
      esfunction.filter.match[path] = {
        query: pathValue
      };
      if (rule.algorithm === 'damerau-levenshtein' || rule.algorithm === 'levenshtein') {
        esfunction.filter.match[path].fuzziness = rule.threshold;
        if (rule.algorithm === 'damerau-levenshtein') {
          esfunction.filter.match[path].fuzzy_transpositions = true;
        } else {
          esfunction.filter.match[path].fuzzy_transpositions = false;
        }
      }
      esquery.query.script_score.query.function_score.functions.push(esfunction);
    }
  }

  if (Object.keys(decisionRule.filters).length === 0) {
    esquery.query.script_score.query.function_score.query = {
      match_all: {}
    };
  }

  if (Object.keys(decisionRule.filters).length > 0) {
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
          term[path] = {value};
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
        term[path] = {value: pathValue};
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
  const params = {fields: []};
  for (const ruleField in decisionRule.fields) {
    const rule = decisionRule.fields[ruleField];
    const match = Math.log(parseFloat(rule.mValue)/parseFloat(rule.uValue));
    const unmatch = Math.log((1-parseFloat(rule.mValue))/(1-parseFloat(rule.uValue)));
    params.fields.push({
      prime: primes[index],
      match,
      unmatch
    });
    index++;
  }
  esquery.query.script_score.script = {
    "source": "double result = 100.0;for( item in params.fields ) {result += ( _score % item.prime == 0 ?item.match : item.unmatch );}return result;",
    params
  };
  esquery.query.script_score.min_score = decisionRule.threshold;
  return esquery;
};

const performMatch = ({
  sourceResource,
  ignoreList
}, callback) => {
  let error = false;
  let maxScore;
  let resourceID; //ID of a matched resource that has the highest score
  const ESMatches = [];
  const FHIRMatches = {
    entry: []
  };
  const decisionRules = config.get('rules');
  async.eachSeries(decisionRules, (decisionRule, nxtRule) => {
    let esquery = {};
    if(decisionRule.matchingType === 'probabilistic') {
      esquery = buildProbabilisticQuery(sourceResource, decisionRule);
    } else if(decisionRule.matchingType === 'deterministic') {
      esquery = buildDeterministicQuery(sourceResource, decisionRule);
    } else {
      logger.error('Matching type is not specified under decision rule, should be either deterministic or probabilistic');
      return callback(true);
    }
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
        const isBroken = matchingMixin.isMatchBroken(sourceResource, `Patient/${id}`);
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
      for(const esmatched of ESMatches) {
        for(const res of esmatched.results) {
          if(!query) {
            query = '_id=' + res['_id'];
          } else {
            query += ',' + res['_id'];
          }
        }
      }
      if(!query) {
        logger.error('An expected error has occured, cant pull FHIR resources from ' + ESMatches);
        error = true;
        return callback(error);
      }
      fhirWrapper.getResource({
        resource: 'Patient',
        query
      }, (results) => {
        // get golden id of the resource that had higher score
        let goldenID;
        for(const entry of results.entry) {
          if(entry.resource.id === resourceID) {
            if(entry.resource.link && Array.isArray(entry.resource.link) && entry.resource.link.length > 0) {
              goldenID = entry.resource.link[0].other.reference;
            }
          }
        }
        // remove any other macthed resources that has different golden id than the one with highest score
        FHIRMatches.entry = results.entry.filter((entry) => {
          return entry.resource.link.find((link) => {
            return link.other.reference === goldenID;
          });
        });

        for(const index in ESMatches) {
          ESMatches[index].results = ESMatches[index].results.filter((results) => {
            return FHIRMatches.entry.find((entry) => {
              return entry.resource.id === results['_id'];
            });
          });
          // ESMatches = ESMatches.filter((match) => {
          //   return match.results.length > 0;
          // });
        }
        return callback(error, FHIRMatches, ESMatches);
      });
    } else {
      return callback(error, FHIRMatches, ESMatches);
    }
  });
};

module.exports = {
  performMatch,
};
