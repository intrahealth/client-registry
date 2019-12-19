const request = require('request');
const URI = require('urijs');
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
  getResource({
    resource,
    url,
    id,
    count
  }, callback) {
    if (!url) {
      url = URI(config.get('fhirServer:baseURL'))
        .segment('fhir')
        .segment(resource)
      if (id) {
        url.segment(id)
      }
      if (count && !isNaN(count)) {
        url.addQuery("_count", count)
      } else {
        count = 0
      }
      url = url.toString();
    } else {
      count = true
    }
    let resourceData = {};
    resourceData.entry = []
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
          resourceData.next = next
          return callback(null, url);
        });
      }, () => {
        return callback(resourceData);
      }
    );
  }
})