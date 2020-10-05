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
    min_score: decisionRule.potentialMatchThreshold
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
    let null_handling;
    let null_handling_both;
    if(rule.nullHandling) {
      null_handling = rule.nullHandling;
    } else if(decisionRule.nullHandling) {
      null_handling = decisionRule.nullHandling;
    }

    if(rule.nullHandlingBothFields) {
      null_handling_both = rule.nullHandlingBothFields;
    } else if(decisionRule.nullHandlingBothFields) {
      null_handling_both = decisionRule.nullHandlingBothFields;
    }
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
    if(null_handling) {
      matcher.null_handling = null_handling;
    }
    if(null_handling_both) {
      matcher.null_handling_both = null_handling_both;
    }
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
  currentGoldenLink,
  ignoreList
}, callback) => {
  logger.info('Finding matches for patient ' + JSON.stringify(sourceResource.identifier, 0, 2));
  let error = false;
  let maxScore;
  let resourceID; //ID of a matched resource that has the highest score
  const ESMatches = [];
  const FHIRPotentialMatches = {
    entry: []
  };
  const FHIRAutoMatched = {
    entry: []
  };
  const FHIRConflictsMatches = {
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
        if (!body || !body.hits || !body.hits.hits || !Array.isArray(body.hits.hits)) {
          logger.error(JSON.stringify(body, 0, 2));
          return nxtRule();
        }
        const potentialHits = [];
        const autoHits = [];
        const conflictsHits = [];
        for (const hit of body.hits.hits) {
          const id = hit['_id'];
          if (ignoreList.includes(id)) {
            continue;
          }
          const isBroken = generalMixin.isMatchBroken(sourceResource, `Patient/${id}`);
          if (isBroken) {
            continue;
          }
          const score = parseFloat(hit['_score']);
          if(score < decisionRule.autoMatchThreshold) {
            potentialHits.push(hit);
          } else if(score >= decisionRule.autoMatchThreshold) {
            autoHits.push(hit);
          }

          // take the one with the highest score
          if (score > parseFloat(maxScore) || (!maxScore && score >= decisionRule.autoMatchThreshold)) {
            resourceID = id;
            maxScore = score;
          }
        }
        ESMatches.push({
          rule: decisionRule,
          potentialMatchResults: potentialHits,
          autoMatchResults: autoHits,
          conflictsMatchResults: conflictsHits,
          query: esquery
        });
        return nxtRule();
      });
    }, () => {
      const goldenRecords = {
        entry: []
      };
      const fhirMatchResults = {
        entry: []
      };
      async.parallel({
        auto: (callback) => {
          if(resourceID) {
            let query;
            for (const esmatched of ESMatches) {
              for (const res of esmatched.autoMatchResults) {
                if (!query) {
                  query = '_id=' + res['_id'];
                } else {
                  query += ',' + res['_id'];
                }
              }
            }
            if(!query) {
              return callback(null);
            }
            query += '&_include=Patient:link';
            fhirWrapper.getResource({
              resource: 'Patient',
              query,
              noCaching: true
            }, (resourceData) => {
              goldenRecords.entry = resourceData.entry.filter((entry) => {
                return entry.search.mode === 'include';
              });
              fhirMatchResults.entry = resourceData.entry.filter((entry) => {
                //find and use another match that has the same score as resourceID but is linked to the current golden ID of the submitted patient
                if(entry.resource.link) {
                  for(let link of entry.resource.link) {
                    let sameScore = ESMatches.find((esmatch) => {
                      return esmatch.autoMatchResults.find((autoM) => {
                        return autoM['_score'] === maxScore && entry.resource.id === autoM['_id'] && autoM['_id'] !== resourceID;
                      });
                    });
                    if(link.other.reference.split('/')[1] === currentGoldenLink && sameScore) {
                      resourceID = entry.resource.id;
                    }
                  }
                }
                // end of finding another match

                return entry.search.mode === 'match';
              });
              return callback(null);
            });
          } else {
            return callback(null);
          }
        },
        potential: (callback) => {
          let query;
          for (const esmatched of ESMatches) {
            for (const res of esmatched.potentialMatchResults) {
              if (!query) {
                query = '_id=' + res['_id'];
              } else {
                query += ',' + res['_id'];
              }
            }
          }
          if(!query) {
            return callback(null);
          }
          fhirWrapper.getResource({
            resource: 'Patient',
            query,
            noCaching: true
          }, (resourceData) => {
            FHIRPotentialMatches.entry = resourceData.entry;
            return callback(null);
          });
        }
      }, () => {
        if(resourceID) {
          // get golden id of the resource that had higher score
          let goldenID;
          for (const entry of fhirMatchResults.entry) {
            if (entry.resource.id === resourceID) {
              if (entry.resource.link && Array.isArray(entry.resource.link) && entry.resource.link.length > 0) {
                goldenID = entry.resource.link[0].other.reference;
              }
            }
          }
          // remove any other matched resources that has different golden id than the one with highest score
          for(let fhirMatch of fhirMatchResults.entry) {
            let sameGoldenID = fhirMatch.resource.link.find((link) => {
              return link && link.other && link.other.reference === goldenID;
            });
            if(sameGoldenID) {
              FHIRAutoMatched.entry.push(fhirMatch);
            } else {
              FHIRConflictsMatches.entry.push(fhirMatch);
            }
          }

          // remove any other matched ES resources that has different golden id than the one with highest score
          for (const index in ESMatches) {
            let deletedAutoIndex = 0;
            let total = ESMatches[index].autoMatchResults.length;
            for(let autoIndex = 0; autoIndex < total; autoIndex++) {
              let autoMatch = ESMatches[index].autoMatchResults[autoIndex - deletedAutoIndex];
              let exist = FHIRAutoMatched.entry.find((entry) => {
                return entry.resource.id === autoMatch['_id'];
              });
              if(!exist) {
                ESMatches[index].conflictsMatchResults.push(autoMatch);
                ESMatches[index].autoMatchResults.splice(autoIndex - deletedAutoIndex, 1);
                deletedAutoIndex++;
              }
            }
          }

          //move to automatch any potential match that has the same golden id as those on auto match
          let deletedIndex = 0;
          let total = FHIRPotentialMatches.entry.length;
          for(let potentialIndex = 0; potentialIndex < total; potentialIndex++) {
            let potentialMatch = FHIRPotentialMatches.entry[potentialIndex - deletedIndex].resource;
            let sameGoldenID = potentialMatch.link.find((link) => {
              return link && link.other && link.other.reference === goldenID;
            });
            if(sameGoldenID) {
              FHIRPotentialMatches.entry.splice(potentialIndex - deletedIndex, 1);
              deletedIndex++;
              FHIRAutoMatched.entry.push({
                resource: potentialMatch
              });
              for(let esIndex in ESMatches) {
                let esmatch = ESMatches[esIndex];
                for(let esPotIndex in esmatch.potentialMatchResults) {
                  let esPotMatch = esmatch.potentialMatchResults[esPotIndex];
                  if(esPotMatch['_id'] === potentialMatch.id) {
                    ESMatches[esIndex].potentialMatchResults.splice(esPotIndex, 1);
                    ESMatches[esIndex].autoMatchResults.push(esPotMatch);
                  }
                }
              }
            }
          }
          // end of moving automatch

          goldenRecords.entry = goldenRecords.entry.filter((entry) => {
            return entry.resource.resourceType + '/' + entry.resource.id === goldenID;
          });
          logger.info('Done matching');
          return callback({
            error,
            FHIRAutoMatched,
            FHIRPotentialMatches,
            FHIRConflictsMatches,
            ESMatches,
            matchedGoldenRecords: goldenRecords
          });
        } else {
          logger.info('Done matching');
          return callback({
            error,
            FHIRAutoMatched,
            FHIRPotentialMatches,
            FHIRConflictsMatches,
            ESMatches,
            matchedGoldenRecords: { entry: [] }
          });
        }
      });
    });
  });
};

module.exports = {
  performMatch,
  refreshIndex
};