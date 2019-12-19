/* eslint-disable promise/param-names */
const levenshtein = require('fast-levenshtein');
const dlevenshtein = require('damerau-levenshtein');
const logger = require('./winston');
const config = require('./config');
const fhirWrapper = require('./fhir')();
const Fhir = require('fhir').Fhir;

const fhir = new Fhir();

module.exports = () => ({
  performMatch ({ sourceResource, url }, callback) {
    let matches = [];
    fhirWrapper.getResource(
      {
        resource: 'Patient',
        count: 10,
        url,
      },
      targetResources => {
        this.getMatches(
          {
            sourceResource,
            targetResources,
          },
          matched => {
            matches = matches.concat(matched);
            if (targetResources.next) {
              const next = targetResources.next;
              targetResources = [];
              this.performMatch({ sourceResource, next }, matched => {
                matches = matches.concat(matched);
                return callback(matches);
              });
            } else {
              return callback(matches);
            }
          }
        );
      }
    );
  },
  getMatches ({ sourceResource, targetResources }, callback) {
    const decisionRules = config.get('rules');
    const matches = [];
    const promises = [];
    for (const targetResource of targetResources.entry) {
      promises.push(
        new Promise((resolve, reject) => {
          let missMatchFound = false;
          const rulePromises = [];
          for (const ruleField in decisionRules) {
            rulePromises.push(
              new Promise(ruleResolve => {
                const rule = decisionRules[ruleField];
                const sourceValue = fhir.evaluate(sourceResource, rule.path);
                const targetValue = fhir.evaluate(targetResource, rule.path);
                if (
                  !sourceValue ||
                  !targetValue ||
                  typeof sourceValue === 'object' ||
                  typeof targetValue === 'object'
                ) {
                  if (typeof sourceValue === 'object') {
                    logger.warn(
                      'Object comparison are not supported ' +
                        JSON.stringify(sourceValue)
                    );
                  }
                  if (typeof targetValue === 'object') {
                    logger.warn(
                      'Object comparison are not supported ' +
                        JSON.stringify(targetValue)
                    );
                  }
                  return;
                }
                const algorith = rule.algorith;
                let isMatch;
                switch (algorith) {
                case 'exact':
                  isMatch = this.exactMatcher(sourceValue, targetValue);
                  if (!isMatch) {
                    missMatchFound = true;
                  }
                  break;
                case 'levenshtein':
                  isMatch = this.levenshteinMatcher(
                    sourceValue,
                    targetValue,
                    rule.threshold
                  );
                  if (!isMatch) {
                    missMatchFound = true;
                  }
                  break;
                case 'damerau-levenshtein':
                  isMatch = this.damerauLevenshteinMatcher(
                    sourceValue,
                    targetValue,
                    rule.threshold
                  );
                  if (!isMatch) {
                    missMatchFound = true;
                  }
                  break;
                default:
                  missMatchFound = true;
                  break;
                }
                ruleResolve();
              })
            );
          }
          Promise.all(rulePromises)
            .then(() => {
              if (!missMatchFound) {
                matches.push(targetResource);
              }
              resolve();
            })
            .catch(err => {
              resolve();
              logger.error(err);
            });
        })
      );
    }
    Promise.all(promises)
      .then(() => {
        return callback(matches);
      })
      .catch(err => {
        logger.error(err);
      });
  },
  /**
   *
   * @param {*} value1
   * @param {*} value2
   */
  exactMatcher (value1, value2) {
    value1 = value1.toLowerCase();
    value1 = cleanValue(value1);
    value2 = value2.toLowerCase();
    value2 = cleanValue(value2);
    if (value1 == value2) {
      return true;
    }
    return false;
  },
  levenshteinMatcher (value1, value2, threshold) {
    const score = levenshtein.get(value1, value2);
    if (threshold >= score) {
      return true;
    }
    return false;
  },
  damerauLevenshteinMatcher (value1, value2, threshold) {
    const scores = dlevenshtein(value1, value2);
    if (threshold >= scores.steps) {
      return true;
    }
    return false;
  },
});

function cleanValue (value) {
  value = value.trim();
  return value;
}
