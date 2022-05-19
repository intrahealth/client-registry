const axios = require('axios');
const URI = require('urijs');
const Qs = require('qs');
const async = require('async');
const logger = require('../winston');
const config = require('../config');

axios.defaults.paramsSerializer = function (params) {
  if (params instanceof URLSearchParams) {
    return params.toString();
  }
  return Qs.stringify(params, { arrayFormat: 'repeat' });
};

class InvalidRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.response = {
      status: status || 400,
      body: {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'required',
            diagnostics: message,
          },
        ],
      },
    };
  }
}

const fhirAxios = {
  options: { base: undefined, username: undefined, password: undefined },
  baseUrl: undefined,
  configured: false,
  __genUrl: () => {
    let url = new URI(config.get('fhirServer:baseURL'));
    return url.toString();
  },
  __getAuth: () => {
    if (fhirAxios.options.username && fhirAxios.options.password) {
      return { username: fhirAxios.options.username, password: fhirAxios.options.password };
    }
    return {};
  },
  read: (resource, id, vid) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    if (resource === undefined) {
      reject(new InvalidRequestError('resource must be defined'));
    }
    url = new URI(url).segment(resource);
    if (id !== undefined) {
      url = url.segment(id);
    }
    if (vid) {
      url = url.segment('_history').segment(vid);
    }
    const auth = fhirAxios.__getAuth();
    axios.get(url.toString(), { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  search: (resource, params) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    if (resource === undefined) {
      reject(new InvalidRequestError('resource must be defined'));
    }
    url = new URI(url).segment(resource);
    const auth = fhirAxios.__getAuth();
    axios.get(url.toString(), { auth, params, headers: { 'Cache-Control': 'no-cache' } }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  searchLink: url => new Promise((resolve, reject) => {
    const auth = fhirAxios.__getAuth();

    axios.get(url, { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  searchAll: (resource, params, partition) => new Promise((resolve, reject) => {
    let url = false;
    const responseData = {
      entry: [],
    };
    async.doWhilst(
      (callback) => {
        if (url) {
          fhirAxios.searchLink(url).then((parts) => {
            if (parts.entry) {
              responseData.entry = responseData.entry.concat(parts.entry);
            }
            const next = parts.link && parts.link.find(link => link.relation === 'next');
            url = false;
            if (next) {
              url = next.url;
            }
            return callback(null, url);
          }).catch((err) => {
            logger.error(err);
            return callback(err);
          });
        } else {
          fhirAxios.search(resource, params, partition).then((parts) => {
            if (parts.entry) {
              responseData.entry = responseData.entry.concat(parts.entry);
            }
            const next = parts.link && parts.link.find(link => link.relation === 'next');
            url = false;
            if (next) {
              url = next.url;
            }
            return callback(null, url);
          }).catch((err) => {
            logger.error(err);
            return callback(err);
          });
        }
      },
      () => url !== false,
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve(responseData);
      },
    );
  }),
  create: (resource) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    let err;
    if (resource === undefined) {
      err = new InvalidRequestError('resource must be defined');
      err.response = { status: 404 };
      reject(err);
    }
    url = new URI(url);
    if (resource.resourceType !== 'Bundle') {
      url = url.segment(resource.resourceType);
    } else if (!(resource.type === 'transaction' || resource.type === 'batch')) {
      err = new InvalidRequestError("Bundles must of type 'transaction' or 'batch'");
      err.response = { status: 404 };
      reject(err);
    }
    const auth = fhirAxios.__getAuth();
    axios.post(url.toString(), resource, { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  delete: (resource, params) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    if (resource === undefined) {
      reject(new InvalidRequestError('resource must be defined'));
    }
    url = new URI(url).segment(resource);

    const auth = fhirAxios.__getAuth();
    axios.delete(url.toString(), { auth, params }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  /**
   *
   * @author Ally Shaban
   * @description permanently removes deleted resources
   * @param {string} resource resource type to expunge
   * @param {Object} params
   * @param {string} params.resourceType value must be Parameters
   * @param {object[]} params.parameter expunge parameters
   * @param {number} params.parameter[].limit maximum number of entries to delete
   * @param {boolean} params.parameter[].expungeDeletedResources If set to true, deleted resources will be expunged (including all previous versions of the resource)
   * @param {boolean} params.parameter[].expungePreviousVersions If set to true, non-current versions of resources will be expunged.
   * @param {boolean} params.parameter[].expungeEverything If set to true, current versions of resources will also be expunged.
   * @method expunge
   */
  expunge: (resource, params = {}) => new Promise((resolve, reject) => {
    if (resource === undefined) {
      return reject(new InvalidRequestError('resource must be defined'));
    }
    let url = fhirAxios.__genUrl();
    url = new URI(url).segment(resource).segment('$expunge');
    const auth = fhirAxios.__getAuth();
    axios.post(url.toString(), params, { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  update: (resource) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    if (resource === undefined) {
      reject(new InvalidRequestError('resource must be defined'));
    }
    if (!resource.hasOwnProperty('id') || !resource.id) {
      reject(new InvalidRequestError('resource must have an id field'));
    }
    url = new URI(url).segment(resource.resourceType).segment(resource.id);

    const auth = fhirAxios.__getAuth();
    axios.put(url.toString(), resource, { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
  expand: (valueset, params, complete, containsOnly) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    if (!valueset) {
      reject(new InvalidRequestError('valueset must be defined'));
    }
    url = new URI(url).segment('ValueSet').segment(valueset).segment('$expand');

    const auth = fhirAxios.__getAuth();
    axios.get(url.toString(), { auth, params }).then((response) => {
      if (complete) {
        try {
          const total = response.data.expansion.total;
          let count;
          try {
            count = response.data.expansion.parameter.find(param => param.name === 'count').valueInteger;
          } catch (err) {
            count = total;
          }
          let offset = response.data.expansion.offset || 0;

          if (total > offset + count) {
            offset += count;
            const paging = { count, offset };
            const newparams = { ...params, ...paging };
            fhirAxios.expand(valueset, newparams, complete, containsOnly, partition).then((continued) => {
              if (containsOnly) {
                resolve(response.data.expansion.contains.concat(continued));
              } else {
                response.data.expansion.contains = response.data.expansion.contains.concat(continued.expansion.contains);
                resolve(response.data);
              }
            }).catch((err) => {
              reject(err);
            });
          } else if (containsOnly) {
            resolve(response.data.expansion.contains);
          } else {
            resolve(response.data);
          }
        } catch (err) {
          reject(err);
        }
      } else if (containsOnly) {
        try {
          const total = response.data.expansion.total;
          if (total === response.data.expansion.contains.length) {
            resolve(response.data.expansion.contains);
          } else {
            reject(new InvalidRequestError("Unable to return only the contains element when the full expansion wasn't returned."));
          }
        } catch (err) {
          reject(err);
        }
      } else {
        resolve(response.data);
      }
    }).catch((err) => {
      reject(err);
    });
  }),
  lookup: (params) => new Promise((resolve, reject) => {
    let url = fhirAxios.__genUrl();
    url = new URI(url)
      .segment('CodeSystem')
      .segment('$lookup')
      .addQuery('system', params.system)
      .addQuery('code', params.code);

    const auth = fhirAxios.__getAuth();
    axios.get(url.toString(), { auth }).then((response) => {
      resolve(response.data);
    }).catch((err) => {
      reject(err);
    });
  }),
};

module.exports = fhirAxios;
