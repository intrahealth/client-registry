const config = require('../config');
const request = require('request');
const URI = require('urijs');
const async = require('async');
const ParseConformance = require('./parseConformance').ParseConformance;
const logger = require('../winston');

const parser = new ParseConformance(true);

var structureDefinition = (main, callback) => {

  let url = URI(config.get('fhirServer:baseURL')).segment('StructureDefinition').segment(main).toString();
  const options = {
    url,
    auth: {
      username: config.get('fhirServer:username'),
      password: config.get('fhirServer:password')
    }
  };
  request.get(options, (err, res, body) => {
    if(err) {
      return callback(err);
    }
    let ip = JSON.parse(body);
    if (!ip.snapshot) {
      logger.error('Structure definition ' + main + ' not found');
      return callback(true);
    }
    let extensions = {};
    for (let ele of ip.snapshot.element) {
      if (ele.type) {
        for (let type of ele.type) {
          if (type.profile) {
            for (let profile of type.profile) {
              extensions[profile] = true;
            }
          }
        }
      }
    }
    async.each(extensions, (ext, nxtExt) => {
      let pieces = ext.split('/');
      let sd = pieces[pieces.length - 1];
      let url = URI(config.get('fhirServer:baseURL')).segment('StructureDefinition').segment(sd).toString();
      const options = {
        url,
        auth: {
          username: config.get('fhirServer:username'),
          password: config.get('fhirServer:password')
        }
      };
      request.get(options, (err, res, body) => {
        parser.parseStructureDefinition(body);
        return nxtExt();
      });
    }, () => {
      callback(null, parser.parseStructureDefinition(ip));
    });

  });

};

module.exports = structureDefinition;