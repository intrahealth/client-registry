const config = require('../config');
const request = require('request-promise-native')
const URI = require('urijs');
const ParseConformance = require('./parseConformance').ParseConformance
const logger = require('../winston');

const parser = new ParseConformance(true)

var structureDefinition = (main, callback) => {

  var promises = []
  let url = URI(config.get('fhirServer:baseURL')).segment('StructureDefinition').segment(main).toString()
  request({
      uri: url,
      json: true,
      auth: {
        username: config.get('fhirServer:username'),
        password: config.get('fhirServer:password')
      }
    })
    .then((ip) => {
      if (!ip.snapshot) {
        logger.error('Structure definition ' + main + ' not found')
        return callback(true)
      }
      let extensions = {}
      for (let ele of ip.snapshot.element) {
        if (ele.type) {
          for (let type of ele.type) {
            if (type.profile) {
              for (let profile of type.profile) {
                extensions[profile] = true
              }
            }
          }
        }
      }

      for (let ext in extensions) {
        let pieces = ext.split('/')
        let sd = pieces[pieces.length - 1]
        let url = URI(config.get('fhirServer:baseURL')).segment('StructureDefinition').segment(sd).toString()
        promises.push(request({
          uri: url,
          json: true,
          auth: {
            username: config.get('fhirServer:username'),
            password: config.get('fhirServer:password')
          }
        }))

      }

      Promise.all(promises).then((results) => {
        for (let res of results) {
          parser.parseStructureDefinition(res)
        }
        callback(null, parser.parseStructureDefinition(ip))
      }).catch((err) => {
        callback(err)
      })

    }).catch((err) => {
      callback(err)
    })

}

module.exports = structureDefinition