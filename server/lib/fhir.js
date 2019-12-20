const request = require('request');
const URI = require('urijs');
const async = require('async');
const logger = require('./winston');
const config = require('./config');

module.exports = () => ({
  /**
   *
   * @param {FHIRResource} resource
   * @param {FHIRURL} url
   * @param {ResourceID} id // id of a resource
   * @param {Integer} count
   * @param {Object} callback
   */
  getResource ({
    resource,
    url,
    id,
    query,
    count
  }, callback) {
    const resourceData = {};
    resourceData.entry = [];
    if (!url) {
      url = URI(config.get('fhirServer:baseURL'))
        .segment('fhir')
        .segment(resource);
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
            logger.error('Invalid query supplied, stop getting resources');
            return callback(resourceData);
          }
          url.addQuery(qrArr[0], qrArr[1]);
        }
      }
      url = url.toString();
    } else {
      count = true;
    }
    logger.info(`Getting ${url} from server`);
    async.whilst(
      callback => {
        return callback(null, url !== false);
      },
      callback => {
        const options = {
          url,
          withCredentials: true,
          auth: {
            username: config.get('fhirServer:username'),
            password: config.get('fhirServer:password'),
          },
        };
        url = false;
        request.get(options, (err, res, body) => {
          if (err) {
            logger.error(err);
          }
          if (!isJSON(body)) {
            logger.error('Non JSON has been returned while getting data for resource ' + resource);
            return callback(null, false);
          }
          body = JSON.parse(body);
          if (body.total === 0 && body.entry && body.entry.length > 0) {
            logger.error('Non resource data returned for resource ' + resource);
            return callback(null, false);
          }
          if (body.total > 0 && body.entry && body.entry.length > 0) {
            resourceData.entry = resourceData.entry.concat(body.entry);
          }
          const next = body.link.find(link => link.relation === 'next');
          if (!count || (count && !isNaN(count) && resourceData.entry.length < count)) {
            if (next) {
              url = next.url;
            }
          }
          resourceData.next = next;
          return callback(null, url);
        });
      }, () => {
        return callback(resourceData);
      }
    );
  },

  saveResource ({
    resourceData
  }, callback) {
    const url = URI(config.getConf('mCSD:url')).segment('fhir').toString();
    const options = {
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      json: resourceData,
    };
    request.post(options, (err, res, body) => {
      if (err) {
        logger.error(err);
        return callback(err);
      }
      callback(err, body);
    });
  },
  /**
   *
   * @param {PatientsBundle} patients
   * @param {Reference} linkReference // i.e Patient/123
   */
  linkPatients ({
    patients,
    linkReference
  }, callback) {
    const promises = [];
    for (const patient of patients.entry) {
      promises.push(new Promise((resolve, reject) => {
        if (!Array.isArray(patient.resource.link)) {
          patient.resource.link = [];
        }
        const linkExist = patient.resource.link.find((link) => {
          return link.other.reference === linkReference;
        });
        if (!linkExist) {
          patient.resource.link.push({
            other: {
              reference: linkReference
            },
            type: 'seealso'
          });
          patient.request = {
            method: 'PUT',
            url: `Patient/${patient.resource.id}`,
          };
        }
        resolve();
      }));
    }
    Promise.all(promises).then(() => {
      const bundle = {};
      bundle.entry = [];
      bundle.type = 'batch';
      bundle.resourceType = 'Bundle';
      bundle.entry = bundle.entry.concat(patients.entry);
      this.saveResource({
        bundle
      }, () => {
        callback();
      });
    });
  }
});
