const axios = require('axios');
const async = require('async');
const URI = require('urijs');
const moment = require('moment');
const fhirpath = require('fhirpath');
const generalMixin = require('../mixins/generalMixin');
const fhirWrapper = require('../fhir')();
const structureDefinition = require('./structureDefinition');
const config = require('../config');
const logger = require('../winston');
const slashes = require('slashes');

const fhirToEsDataType = {
  valueString: 'text',
  valueBoolean: 'boolean',
  valueDate: 'date',
  valueDateTime: 'date',
  valueInteger: 'integer',
  valueAge: 'integer',
  valueTime: 'date',
  valueQuantity: 'double',
};
const flattenComplex = extension => {
  const results = {};
  for (const ext of extension) {
    let value = '';
    for (const key of Object.keys(ext)) {
      if (key !== 'url') {
        value = ext[key];
      }
    }
    if (results[ext.url]) {
      if (Array.isArray(results[ext.url])) {
        results[ext.url].push(value);
      } else {
        results[ext.url] = [results[ext.url], value];
      }
    } else {
      if (Array.isArray(value)) {
        results[ext.url] = [value];
      } else {
        results[ext.url] = value;
      }
    }
  }
  return results;
};

/**
 *
 * @param {relativeURL} reference //reference must be a relative url i.e Practioner/10
 */
const getResourceFromReference = reference => {
  return new Promise(resolve => {
    const url = URI(config.get('fhirServer:baseURL'))
      .segment(reference)
      .toString();
    axios
      .get(url, {
        withCredentials: true,
        auth: {
          username: config.get('fhirServer:username'),
          password: config.get('fhirServer:password'),
        },
      })
      .then(response => {
        logger.info('sending back response');
        return resolve(response.data);
      })
      .catch(err => {
        logger.error(err);
        return false;
      });
  }).catch(err => {
    logger.error(err);
  });
};

/**
 *
 * @param {Array} extension
 * @param {String} element
 */
const getElementValFromExtension = (extension, element) => {
  return new Promise(resolve => {
    let elementValue = '';
    async.each(
      extension,
      (ext, nxtExt) => {
        let value;
        for (const key of Object.keys(ext)) {
          if (key !== 'url') {
            value = ext[key];
          }
        }
        if (ext.url === element) {
          elementValue = value;
        }
        (async () => {
          if (Array.isArray(value)) {
            const val = await getElementValFromExtension(value, element);
            if (val) {
              elementValue = val;
            }
            return nxtExt();
          } else {
            return nxtExt();
          }
        })();
      },
      () => {
        resolve(elementValue);
      }
    );
  }).catch(err => {
    logger.error(err);
  });
};

const getImmediateLinks = (orderedResources, links, callback) => {
  if (orderedResources.length - 1 === links.length) {
    return callback(orderedResources);
  }
  const promises = [];
  for (let link of links) {
    promises.push(
      new Promise((resolve, reject) => {
        link = flattenComplex(link.extension);
        const parentOrdered = orderedResources.find(orderedResource => {
          return orderedResource.name === link.linkTo;
        });
        const exists = orderedResources.find(orderedResource => {
          return JSON.stringify(orderedResource) === JSON.stringify(link);
        });
        if (parentOrdered && !exists) {
          orderedResources.push(link);
        }
        resolve();
      })
    );
  }
  Promise.all(promises).then(() => {
    if (orderedResources.length - 1 !== links.length) {
      getImmediateLinks(orderedResources, links, orderedResources => {
        return callback(orderedResources);
      });
    } else {
      return callback(orderedResources);
    }
  });
};

const getFields = (links, reportDetails) => {
  const details =
    reportDetails[
      'http://ihris.org/fhir/StructureDefinition/iHRISReportElement'
    ];
  const fields = [];
  for (const detail of details) {
    const label = detail.find(det => {
      return det.url === 'label';
    });
    if (!label) {
      logger.error('No label found for ' + detail);
      continue;
    }
    populateField(label);
  }

  for (const link of links) {
    const reportElements = link.extension.filter(ln => {
      return (ln.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportElement');
    });
    for (const element of reportElements) {
      const label = element.extension.find(det => {
        return det.url === 'label';
      });
      if (!label) {
        logger.error('No label found for ' + detail);
        continue;
      }
      populateField(label);
    }
  }
  return fields;

  function populateField(label) {
    const keys = Object.keys(label);
    const urlPos = keys.indexOf('url');
    keys.splice(urlPos, 1);
    if (keys.length !== 1) {
      logger.error(
        'Something is wrong with the report relationship, cant determine data type for ' +
        JSON.stringify(field, 0, 2)
      );
      return;
    }
    const fhirDataType = keys[0];
    let esDataType = fhirToEsDataType[fhirDataType];
    if (!esDataType) {
      esDataType = 'text';
    }
    fields.push({
      name: label[fhirDataType],
      type: esDataType,
    });
  }
};

const addSlashes = value => {
  if (typeof value === 'object') {
    for (const index in value) {
      if (typeof value[index] === 'object') {
        addSlashes(value[index]);
      } else {
        value[index] = slashes.add(value[index]);
      }
    }
  } else {
    value = slashes.add(value);
  }
  return value;
};

const updateESCompilationsRate = callback => {
  logger.info('Setting maximum compilation rate');
  const url = URI(config.get('elastic:server'))
    .segment('_cluster')
    .segment('settings')
    .toString();
  const body = {
    transient: {
      'script.max_compilations_rate': config.get(
        'elastic:max_compilations_rate'
      ),
    },
  };
  let auth = {
    username: config.get('elastic:username'),
    password: config.get('elastic:password'),
  };
  axios.put(url, body, { auth }).then(response => {
    if (response.status > 199 && response.status < 299) {
      logger.info('maximum compilation rate updated successfully');
      return callback(false);
    } else {
      logger.error('An error has occured while setting max compilation rate');
      return callback(true);
    }
  }).catch(err => {
    logger.error('An error has occured while setting max compilation rate');
    callback(err);
    throw err;
  });
};

const createESIndex = (name, IDFields, reportFields, callback) => {
  async.series({
    createAnalyzer: callback => {
      logger.info('Creating analyzer into elasticsearch for index ' + name);
      const url = URI(config.get('elastic:server')).segment(name).toString();
      const settings = {
        settings: {
          analysis: {
            analyzer: {
              levenshtein_analyzer: {
                type: 'custom',
                tokenizer: 'keyword',
                filter: ['lowercase'],
              },
              phonetic_analyzer: {
                tokenizer: 'keyword',
                filter: ['lowercase', 'cr_metaphone'],
              },
            },
            filter: {
              cr_metaphone: {
                type: 'phonetic',
                encoder: 'metaphone',
                replace: false,
              },
            },
          },
        },
      };
      let auth = {
        username: config.get('elastic:username'),
        password: config.get('elastic:password'),
      };
      axios.put(url, settings, { auth }).then(response => {
        if (response.status >= 200 && response.status <= 299) {
          logger.info('Analyzer created successfully');
          return callback(null);
        } else {
          logger.error(
            'Something went wrong while creating analyzer into elasticsearch'
          );
          return callback(true);
        }
      }).catch(err => {
        if (
          err.response &&
          err.response.status &&
          (err.response.status === 400 || err.response.status === 403)
        ) {
          logger.info(
            'Analyzer already exist into elasticsearch, not creating'
          );
          return callback(null);
        } else {
          logger.error(err);
          return callback(true);
        }
      });
    },
    createMapping: callback => {
      logger.info('Adding mappings into elasticsearch for index ' + name);
      const url = URI(config.get('elastic:server'))
        .segment(name)
        .segment('_mapping')
        .toString();
      const mapping = {
        properties: {},
      };
      for (const IDField of IDFields) {
        mapping.properties[IDField] = {};
        mapping.properties[IDField].type = 'keyword';
      }
      for (const field of reportFields) {
        mapping.properties[field.name] = {
          type: field.type,
          analyzer: 'levenshtein_analyzer',
          fields: {
            jaro: {
              type: 'keyword'
            },
            phonetic: {
              type: field.type,
              analyzer: 'phonetic_analyzer',
            },
          },
        };
      }
      let auth = {
        username: config.get('elastic:username'),
        password: config.get('elastic:password'),
      };
      axios.put(url, mapping, { auth }).then(response => {
        if (response.status >= 200 && response.status <= 299) {
          logger.info('Mappings added successfully into elasticsearch');
          return callback(null);
        } else {
          logger.error(
            'Something went wrong while adding mappings into elasticsearch'
          );
          return callback(true);
        }
      }).catch(err => {
        if (
          err.response &&
          err.response.status &&
          (err.response.status === 400 || err.response.status === 403)
        ) {
          logger.info(
            'Mappings already exist into elasticsearch, not creating'
          );
          return callback(null);
        } else {
          logger.error(
            'Something went wrong while adding mappings into elasticsearch'
          );
          logger.error(err);
          return callback(true);
        }
      });
    },
  }, err => {
    return callback(err);
  });
};

const updateESDocument = (id, index, record, callback) => {
  const url = URI(config.get('elastic:server'))
    .segment(index)
    .segment('_doc')
    .segment(id)
    .toString();
  let auth = {
    username: config.get('elastic:username'),
    password: config.get('elastic:password')
  };
  axios.post(url, record, { auth }).then(response => {
    logger.info(response.data);
    if (response.data._shards.failed) {
      logger.warn('Transaction failed, rerunning again');
      setTimeout(() => {
        updateESDocument(id, index, record, () => {
          return callback();
        });
      }, 2000);
    } else {
      return callback();
    }
  }).catch(err => {
    if (
      err.response &&
      (err.response.statusText === 'Conflict' || err.response.status === 409)
    ) {
      logger.warn('Conflict occured, rerunning this request');
      setTimeout(() => {
        updateESDocument(id, index, record, () => {
          return callback();
        });
      }, 2000);
    } else {
      logger.error('Error Occured');
      if (err.response && err.response.data) {
        logger.error(err.response.data);
      }
      if (err.error) {
        logger.error(err.error);
      }
      if (!err.response) {
        logger.error(err);
      }
      return callback();
    }
  });
};

const deleteESDocument = (id, index, callback) => {
  logger.info('Deleting ES record with id ' + id);
  const url = URI(config.get('elastic:server'))
    .segment(index)
    .segment('_doc')
    .segment(id)
    .toString();
  axios({
    method: 'DELETE',
    url,
    auth: {
      username: config.get('elastic:username'),
      password: config.get('elastic:password'),
    },
  }).then(response => {
    logger.info(response.data);
    return callback();
  }).catch((err) => {
    logger.error('An error occured while trying to delete ES record with id ' + id);
    logger.error(err);
    return callback();
  });
};

const fhir2ES = ({
  lastSync,
  patientsBundle
}, callback) => {
  const isValid = moment(lastSync, 'Y-MM-DDTHH:mm:ss').isValid();
  if (!isValid) {
    lastSync = moment('1970-01-01').format('Y-MM-DDTHH:mm:ss');
  }
  let newLastSyncTime;
  const relId = config.get('structureDefinition:reportRelationship');
  fhirWrapper.getResource({
    resource: 'Basic',
    id: relId,
  }, relationship => {
    if (!relationship) {
      logger.error('No relationship with id ' + relId + ' found');
      return callback(true);
    }
    logger.info('processing relationship ID ' + relationship.id);
    const sd = relationship.subject && relationship.subject.reference.substring(
      relationship.subject.reference.lastIndexOf('/')
    );
    structureDefinition(sd, (err, subject) => {
      if (err) {
        return callback(true);
      }
      const details = relationship.extension.find(ext => ext.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportDetails');
      const links = relationship.extension.filter(ext => ext.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportLink');
      const reportDetails = flattenComplex(details.extension);
      const orderedResources = [];
      const IDFields = [];
      reportDetails.resource = subject._type;
      orderedResources.push(reportDetails);
      IDFields.push(reportDetails.name);
      const reportFields = getFields(links, reportDetails);
      for (const linkIndex1 in links) {
        const link1 = links[linkIndex1];
        const flattenedLink1 = flattenComplex(link1.extension);
        IDFields.push(flattenedLink1.name);
        for (const link2 of links) {
          const flattenedLink2 = flattenComplex(link2.extension);
          if (
            flattenedLink2.linkTo === flattenedLink1.name &&
            !flattenedLink2.linkElement.startsWith(
              flattenedLink2.resource + '.'
            )
          ) {
            const linkElement = flattenedLink2.linkElement.split('.').pop();
            links[linkIndex1].extension.push({
              url: 'http://ihris.org/fhir/StructureDefinition/iHRISReportElement',
              extension: [{
                url: 'label',
                valueString: linkElement,
              }, {
                url: 'name',
                valueString: linkElement,
              }, {
                url: 'autoGenerated',
                valueBoolean: true,
              }, ],
            });
          }
        }
      }
      updateESCompilationsRate(() => {
        createESIndex(reportDetails.name, IDFields, reportFields, err => {
          if (err) {
            logger.error(
              'Stop creating report due to error in creating index'
            );
            return callback(true);
          }
          getImmediateLinks(orderedResources, links, () => {
            async.eachSeries(orderedResources, (orderedResource, nxtResource) => {
              newLastSyncTime = moment().format('Y-MM-DDTHH:mm:ss');
              let resourceData = [];
              const promise = new Promise(resolve => {
                if (
                  patientsBundle &&
                  patientsBundle.entry &&
                  Array.isArray(patientsBundle.entry) &&
                  patientsBundle.entry.length > 0
                ) {
                  resourceData = resourceData.concat(patientsBundle.entry);
                  resolve();
                } else {
                  fhirWrapper.getResource({
                    resource: orderedResource.resource,
                    extraPath: ['_history'],
                    query: '_since=' + lastSync,
                  }, data => {
                    if(data.entry) {
                      data.entry = data.entry.reverse();
                      resourceData = resourceData.concat(data.entry);
                    }
                    resolve();
                  });
                }
              });
              promise.then(() => {
                logger.info('Writting resource data for resource ' + orderedResource.resource + ' into elastic search');
                const processedRecords = [];
                let count = 1;
                async.eachSeries(resourceData, (data, next) => {
                  logger.info('processing ' + count + '/' + resourceData.length + ' records of resource ' + orderedResource.resource);
                  count++;
                  if(data.resource &&
                    (!data.resource.link ||
                    (data.resource.link && Array.isArray(data.resource.link) && data.resource.link.length === 0) ||
                    data.resource.link && !Array.isArray(data.resource.link))) {
                    return next();
                  }
                  const isGoldenRec = data.resource && data.resource.meta && data.resource.meta.tag && data.resource.meta.tag.find((tag) => {
                    return tag.code === config.get('codes:goldenRecord');
                  });
                  if (isGoldenRec) {
                    return next();
                  }
                  if (!data.resource || !data.resource.resourceType) {
                    if(data.request && data.request.method && data.request.method === 'DELETE') {
                      const fullURL = data.fullUrl;
                      if(fullURL) {
                        const id = fullURL.split('/').pop();
                        deleteESDocument(id, reportDetails.name, () => {
                          return next();
                        });
                      } else {
                        return next();
                      }
                    } else {
                      return next();
                    }
                  } else {
                    const id = data.resource.resourceType + '/' + data.resource.id;
                    const processed = processedRecords.find(record => {
                      return record === id;
                    });
                    if (processed) {
                      return next();
                    } else {
                      processedRecords.push(id);
                    }
                    let queries = [];
                    // just in case there are multiple queries
                    if (orderedResource.query) {
                      queries = orderedResource.query.split('&');
                    }
                    for (const query of queries) {
                      const limits = query.split('=');
                      const limitParameters = limits[0];
                      const limitValue = limits[1];
                      const resourceValue = fhirpath.evaluate(
                        data.resource,
                        limitParameters
                      );
                      if (JSON.stringify(resourceValue) != limitValue) {
                        return next();
                      }
                    }
                    const record = {};
                    (async () => {
                      for (const element of orderedResource['http://ihris.org/fhir/StructureDefinition/iHRISReportElement']) {
                        let fieldLabel;
                        let fieldName;
                        let fieldAutogenerated = false;
                        for (const el of element) {
                          let value = '';
                          for (const key of Object.keys(el)) {
                            if (key !== 'url') {
                              value = el[key];
                            }
                          }
                          if (el.url === 'label') {
                            const fleldChars = value.split(' ');
                            //if label has space then format it
                            if (fleldChars.length > 1) {
                              fieldLabel = value.toLowerCase().split(' ').map(word => word.replace(word[0], word[0].toUpperCase())).join('');
                            } else {
                              fieldLabel = value;
                            }
                          } else if (el.url === 'name') {
                            fieldName = value;
                          } else if (el.url === 'autoGenerated') {
                            fieldAutogenerated = value;
                          }
                        }
                        const displayData = fhirpath.evaluate(
                          data.resource,
                          fieldName
                        );
                        let value;
                        if (
                          (!displayData ||
                            (Array.isArray(displayData) &&
                              displayData.length === 1 &&
                              displayData[0] === undefined)) &&
                          data.resource.extension
                        ) {
                          value = await getElementValFromExtension(data.resource.extension, fieldName);
                        } else if (
                          Array.isArray(displayData) &&
                          displayData.length === 1 &&
                          displayData[0] === undefined
                        ) {
                          value = undefined;
                        } else {
                          value = displayData;
                        }
                        if (typeof value == 'object') {
                          if (value.reference && fieldAutogenerated) {
                            value = value.reference;
                          } else if (
                            value.reference &&
                            !fieldAutogenerated
                          ) {
                            const referencedResource = await getResourceFromReference(value.reference);
                            if (referencedResource) {
                              value = referencedResource.name;
                            }
                          }
                        }
                        if (!value) {
                          value = '';
                        }
                        if(Array.isArray(value)) {
                          value = value.join(" ");
                        }
                        record[fieldLabel] = value;
                      }
                      record[orderedResource.name] = id;
                      updateESDocument(data.resource.id, reportDetails.name, record, () => {
                        return next();
                      });
                    })();
                  }
                }, () => {
                  logger.info('Done Writting resource data for resource ' + orderedResource.name + ' into elastic search');
                  return nxtResource();
                });
              });
            }, () => {
              if (
                patientsBundle &&
                patientsBundle.entry &&
                Array.isArray(patientsBundle.entry) &&
                patientsBundle.entry.length > 0
              ) {
                return callback();
              } else {
                generalMixin.updateConfigFile(['sync', 'lastFHIR2ESSync'], newLastSyncTime, () => {
                  return callback();
                });
              }
            });
          });
        });
      });
    });
  });
};

module.exports = {
  fhir2ES,
};