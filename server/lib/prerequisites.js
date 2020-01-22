const request = require('request');
const URI = require('urijs');
const config = require('./config');
const logger = require('./winston');
const fs = require('fs');
const Fhir = require('fhir').Fhir;

const convert = new Fhir();

const loadResources = (callback) => {
  let processingError = false;
  const folders = [
    `${__dirname}/../../resources/StructureDefinition`,
    `${__dirname}/../../resources/SearchParameter`,
    `${__dirname}/../../resources/Relationships`
  ];
  const promises = [];
  for (const folder of folders) {
    fs.readdirSync(folder).forEach(file => {
      promises.push(new Promise((resolve) => {
        logger.info('Loading ' + file + ' into FHIR server...');
        fs.readFile(`${folder}/${file}`, (err, data) => {
          if (err) throw err;
          let fhir;
          if (file.substring(file.length - 3) === 'xml') {
            fhir = convert.xmlToObj(data);
          } else {
            fhir = JSON.parse(data);
          }
          const dest = URI(config.get('fhirServer:baseURL')).segment(fhir.resourceType).segment(fhir.id).toString();
          const options = {
            url: dest,
            withCredentials: true,
            auth: {
              username: config.get('fhirServer:username'),
              password: config.get('fhirServer:password')
            },
            headers: {
              'Content-Type': 'application/json',
            },
            json: fhir,
          };
          if (fhir.resourceType === 'Bundle' &&
            (fhir.type === 'transaction' || fhir.type === 'batch')) {
            logger.info('Saving ' + fhir.type);
            request.post(options, (err, res, body) => {
              resolve();
              if (err) {
                logger.error(err)
                processingError = true;
              }
              if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
                processingError = true;
              }
              logger.info(dest + ': ' + res.statusCode);
              logger.info(JSON.stringify(res.body, null, 2));
            });
          } else {
            logger.info('Saving ' + fhir.resourceType + ' - ' + fhir.id);
            request.put(options, (err, res, body) => {
              if (fhir.id === "patientreport")
                console.log(body);
              resolve();
              if (err) {
                logger.error(err)
                processingError = true;
              }
              if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
                processingError = true;
              }
              logger.info(dest + ': ' + res.statusCode);
              logger.info(res.headers['content-location']);
            });
          }
        });
      }));
    });
  }

  Promise.all(promises).then(() => {
    logger.info('Done loading required resources');
    return callback(processingError);
  }).catch((err) => {
    throw err;
  });
};

module.exports = {
  loadResources
};