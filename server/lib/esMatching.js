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

const refreshIndex = (callback) => {
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
    return callback();
  });
};

const buildQuery = (sourceResource, decisionRule) => {
  const esquery = {};
  esquery.query = {};
  esquery.query.function_score = {
    query: {
      bool: {}
    },
    boost_mode: "sum",
    functions: [],
    min_score: decisionRule.threshold
  };
  let esfunction = {
    script_score: {
      script: {
        source: "string_similarity",
        lang: "similarity_scripts",
        params: {}
      }
    }
  };
  if (decisionRule.matchingType === 'deterministic') {
    esfunction.script_score.script.params.score_mode = 'sum';
  } else if (decisionRule.matchingType === 'probabilistic') {
    esfunction.script_score.script.params.score_mode = 'fellegi-sunter';
    esfunction.script_score.script.params.base_score = 100.0;
  }
  let matchers = [];
  for (const ruleField in decisionRule.fields) {
    const rule = decisionRule.fields[ruleField];
    let path = rule.espath;
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
    const value = values.join(" ");
    if (rule.algorithm === 'phonetic' && decisionRule.matchingType === 'probabilistic') {
      logger.error('Phonetic is not supported for probabilistic matching, use it for deterministic matching only. Aborting matching process');
      return {};
    }
    if (rule.algorithm === 'phonetic') {
      path += '.phonetic';
      if (!esquery.query.function_score.query.bool.must) {
        esquery.query.function_score.query.bool.must = [];
      }
      let phonet = {};
      phonet.match = {};
      phonet.match[path] = {
        query: value
      };
      esquery.query.function_score.query.bool.must.push(phonet);
      continue;
    }
    let matcher = {
      field: path,
      value
    };
    if (rule.algorithm === 'exact') {
      matcher.matcher = 'normalized-levenshtein-similarity';
      matcher.threshold = 1.0;
    } else {
      matcher.matcher = rule.algorithm;
      if (!isNaN(parseFloat(rule.threshold))) {
        matcher.threshold = rule.threshold;
      }
    }
    if (!isNaN(parseFloat(rule.weight)) && decisionRule.matchingType === 'deterministic') {
      matcher.weight = rule.weight;
    }
    if (decisionRule.matchingType === 'probabilistic') {
      matcher.m_value = rule.mValue;
      matcher.u_value = rule.uValue;
    }
    matchers.push(matcher);
  }
  esfunction.script_score.script.params.matchers = matchers;
  esquery.query.function_score.functions.push(esfunction);
  if (!decisionRule.filters || Object.keys(decisionRule.filters).length === 0) {
    esquery.query.function_score.query = {
      match_all: {}
    };
  }
  if (decisionRule.filters && Object.keys(decisionRule.filters).length > 0) {
    esquery.query.function_score.query.bool.filter = [];
    for (const filterField in decisionRule.filters) {
      const block = decisionRule.filters[filterField];
      const term = {};
      const path = block.espath;
      let pathValue = fhir.evaluate(sourceResource, block.fhirpath);
      if (Array.isArray(pathValue) && !(pathValue.length === 1 && pathValue[0] === undefined)) {
        if (pathValue.length === 0) {
          term[path] = '';
          esquery.query.function_score.query.bool.filter.push({
            term
          });
        }
        for (const value of pathValue) {
          term[path] = value;
          const tmpTerm = _.cloneDeep(term);
          esquery.query.function_score.query.bool.filter.push({
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
        esquery.query.function_score.query.bool.filter.push({
          term,
        });
      }
    }
  }
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
      if (decisionRule.matchingType !== 'probabilistic' && decisionRule.matchingType !== 'deterministic') {
        logger.error('Matching type is not specified under decision rule, should be either deterministic or probabilistic');
        return callback(true);
      }
      let esquery = buildQuery(sourceResource, decisionRule);
      if (Object.keys(esquery).length === 0) {
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