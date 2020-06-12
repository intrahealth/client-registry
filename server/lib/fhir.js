'use strict';
const request = require('request');
const URI = require('urijs');
const async = require('async');
const uuid4 = require('uuid/v4');
const isJSON = require('is-json');
const logger = require('./winston');
const config = require('./config');

module.exports = () => ({
  /**
   *
   * @param {FHIRResource} resource
   * @param {Array} extraPath // i.e ['_history]
   * @param {FHIRURL} url
   * @param {ResourceID} id // id of a resource
   * @param {Integer} count
   * @param {Object} callback
   */
  getResource({
    resource,
    extraPath = [],
    noCaching = false,
    url,
    id,
    query,
    count
  }, callback) {
    let statusCode = 500;
    let resourceData = {};
    resourceData.entry = [];
    if (!url) {
      url = URI(config.get('fhirServer:baseURL')).segment(resource);
      for (const path of extraPath) {
        url.segment(path);
      }
      if (id) {
        url.segment(id);
      }
      if (count && !isNaN(count)) {
        url.addQuery('_count', count);
      } else {
        count = 0;
      }
      if (query) {
        const queries = query.split('&');
        for (const qr of queries) {
          const qrArr = qr.split('=');
          if (qrArr.length !== 2) {
            logger.error(qrArr);
            logger.error('Invalid query supplied, stop getting resources');
            return callback(resourceData);
          }
          url.addQuery(qrArr[0], qrArr[1]);
          if (qrArr[0] === '_count') {
            count = true;
          }
        }
      }
      url = url.toString();
    } else {
      count = true;
    }
    logger.info(`Getting ${url} from server`);
    let headers = {};
    if (noCaching) {
      headers = {
        'Cache-Control': 'no-cache',
      };
    }
    async.whilst(
      callback1 => {
        return callback1(null, url !== false);
      },
      callback => {
        const options = {
          url,
          withCredentials: true,
          auth: {
            username: config.get('fhirServer:username'),
            password: config.get('fhirServer:password'),
          },
          headers
        };
        url = false;
        request.get(options, (err, res, body) => {
          statusCode = res.statusCode;
          if (res && (res.statusCode < 200 || res.statusCode > 299)) {
            logger.error(body);
          }
          if (err) {
            logger.error(err);
          }
          if (!isJSON(body)) {
            logger.error(options);
            logger.error(body);
            logger.error('Non JSON has been returned while getting data for resource ' + resource);
            return callback(null, false);
          }
          body = JSON.parse(body);
          if (id && body || body.resourceType !== 'Bundle') {
            resourceData = body;
          } else if (body.entry && body.entry.length > 0) {
            if (count) {
              resourceData = {
                ...body
              };
            } else {
              resourceData.entry = resourceData.entry.concat(body.entry);
            }
          }
          let next = body.link && body.link.find(link => link.relation === 'next');

          if (err || res.statusCode < 200 || res.statusCode > 299) {
            next = false;
          }
          if (!count || (count && !isNaN(count) && resourceData.entry && resourceData.entry.length < count)) {
            if (next) {
              url = next.url;
            }
          }
          if (next) {
            resourceData.next = next.url;
          } else {
            resourceData.next = false;
          }
          return callback(null, url);
        });
      }, () => {
        return callback(resourceData, statusCode);
      }
    );
  },

  deleteResource(resource, callback) {
    const url = URI(config.get('fhirServer:baseURL'))
      .segment(resource)
      .toString();
    const options = {
      url,
      withCredentials: true,
      auth: {
        username: config.get('fhirServer:username'),
        password: config.get('fhirServer:password'),
      },
    };
    request.delete(options, (err, res, body) => {
      if (err) {
        logger.error(err);
        return callback(err);
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
        return callback(true);
      }
      callback(err, body);
    });
  },

  saveResource({
    resourceData
  }, callback) {
    logger.info('Saving resource data');
    const url = URI(config.get('fhirServer:baseURL')).toString();
    const options = {
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
      auth: {
        username: config.get('fhirServer:username'),
        password: config.get('fhirServer:password'),
      },
      json: resourceData,
    };
    request.post(options, (err, res, body) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        logger.error(JSON.stringify(body, 0, 2));
        err = true;
      }
      if (err) {
        logger.error(err);
        return callback(err, body);
      }
      logger.info('Resource(s) data saved successfully');
      callback(err, body);
    });
  },

  createGoldenRecord() {
    const goldenRecord = {
      id: uuid4(),
      resourceType: 'Patient',
      meta: {
        tag: [{
          code: config.get('codes:goldenRecord'),
          display: 'Golden Record'
        }]
      }
    };
    return goldenRecord;
  },
});