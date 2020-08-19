const request = require('request');
const URI = require('urijs');
const async = require('async');
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
    `${__dirname}/../../resources/Relationships`,
    `${__dirname}/../../resources/ResourcesData`,
  ];
  const promises = [];
  const files = [];
  for (const folder of folders) {
    fs.readdirSync(folder).forEach(file => {
      promises.push(new Promise((resolve) => {
        files.push({
          folder,
          name: file
        });
        resolve();
      }));
    });
  }

  Promise.all(promises).then(() => {
    async.eachSeries(files, (file, nxtFile) => {
      logger.info('Loading ' + file.name + ' into FHIR server...');
      fs.readFile(`${file.folder}/${file.name}`, (err, data) => {
        if (err) throw err;
        let fhir;
        if (file.name.substring(file.name.length - 3) === 'xml') {
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
            if (err) {
              logger.error(err);
              processingError = true;
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
              logger.error(body);
              processingError = true;
            }
            logger.info(dest + ': ' + res.statusCode);
            logger.info(JSON.stringify(res.body, null, 2));
            return nxtFile();
          });
        } else {
          logger.info('Saving ' + fhir.resourceType + ' - ' + fhir.id);
          request.put(options, (err, res, body) => {
            if (err) {
              logger.error(err);
              processingError = true;
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
              logger.error(body);
              processingError = true;
            }
            logger.info(dest + ': ' + res.statusCode);
            logger.info(res.headers['content-location']);
            return nxtFile();
          });
        }
      });
    }, () => {
      logger.info('Done loading required resources');
      return callback(processingError);
    });
  }).catch((err) => {
    throw err;
  });
};

const checkInstalledPlugins = (callback) => {
  logger.info('Checking if all elasticsearch plugins are installed');
  const url = URI(config.get('elastic:server'))
    .segment('_cat')
    .segment('plugins')
    .toString();
  const options = {
    url,
    auth: {
      username: config.get('elastic:username'),
      password: config.get('elastic.password'),
    }
  };
  request.get(options, (err, res, body) => {
    if (!body) {
      logger.error('It seems like elasticsearch is not running, please check to ensure elasticsearch is up and running');
      return callback(true);
    }
    if (!body.includes('analysis-phonetic')) {
      logger.error('Phonetic plugin is missing, to install run sudo bin/elasticsearch-plugin install analysis-phonetic and restart elasticsearch');
      return callback(true);
    }
    if (!body.includes('string-similarity-scoring')) {
      logger.error('String similarity plugin is missing, refer https://github.com/intrahealth/similarity-scoring for installation then restart elasticsearch');
      return callback(true);
    }
    logger.info('All plugins are available');
    return callback();
  });
};

const loadESScripts = (callback) => {
  let jaroWinkler = {
    script: {
      lang: "painless",
      source: `
        String s1 = doc[params.field+".jaro"].value;
        String s2 = params.value;
        int len1 = s1.length();
        int len2 = s2.length();
        int maxPrefix = 4;
        if ( params.containsKey("maxPrefix") ) maxPrefix = params.maxPrefix;
        double p = 0.1;
        if ( params.containsKey("scalingFactor") ) p = params.scalingFactor;
        double threshold = 0.9;
        if ( params.containsKey("threshold") ) threshold = params.threshold;
        int m = 0;

        if ( params.containsKey("ignoreCase") && params.ignoreCase ) {
          s1 = s1.toLowerCase();
          s2 = s2.toLowerCase();
        }
        if ( s1 == s2 ) return true;
        if ( len1 == 0 || len2 == 0 ) return false;
        int range = (int)(Math.floor( Math.max( len1, len2 ) / 2) ) - 1;

        boolean[] s1Matches = new boolean[len1];
        boolean[] s2Matches = new boolean[len2];

        for( int i = 0; i < len1; i++ ) {
          int low = (i >= range ? i - range : 0 );
          int high = ( i+range <= len2 - 1 ? i + range : len2 -1 );

          for( int j = low; j <= high; j++ ) {
            if ( s1Matches[i] != true && s2Matches[j] != true
                && s1.charAt(i) == s2.charAt(j) ) {
              ++m;
              s1Matches[i] = true;
              s2Matches[j] = true;
              break;
            }
          }
        }
        if ( m == 0 ) return false;

        int k = 0;
        int numTrans = 0;

        for( int i = 0; i < len1; i++ ) {
          if ( s1Matches[i] == true ) {
            int j;
            for( j = k; j < len2; j++ ) {
              if ( s2Matches[j] == true ) {
                k = j + 1;
                break;
              }
            }
            if ( s1.charAt(i) != s2.charAt(j) ) {
              ++numTrans;
            }
          }
        }

        double weight = ((double)m / (double)len1 + (double)m / (double)len2
          + ( (double)m - ( (double)numTrans / 2.0 ) ) / (double)m) / 3.0;
        int l = 0;
        int maxl = (int)Math.min( maxPrefix, Math.min( len1, len2 ) );

        if ( weight > 0.7 ) {
          while( l < maxl && s1.charAt(l) == s2.charAt(l) ) {
            ++l;
          }
          weight = weight + l * p * (1 - weight);
        }

        return weight >= threshold;
      `
    }
  };

  const url = URI(config.get('elastic:server')).segment('_scripts').segment('jaro-winkler').toString();
  const options = {
    url,
    withCredentials: true,
    auth: {
      username: config.get('elastic:username'),
      password: config.get('elastic:password')
    },
    headers: {
      'Content-Type': 'application/json',
    },
    json: jaroWinkler
  };
  request.post(options, (err, res, body) => {
    if (err) {
      logger.error('An error has occured while adding pro;babilistic jaro winkler script for elasticsearch');
      return callback(err);
    } else {
      logger.info('Jaro winkler loaded successfully');
      return callback();
    }
  });
};

const init = (callback) => {
  let errFound = false;
  async.parallel({
    loadResources: (callback) => {
      loadResources((err) => {
        if (err) {
          errFound = true;
        }
        return callback(null);
      });
    },
    loadESScripts: (callback) => {
      loadESScripts((err) => {
        if (err) {
          errFound = true;
        }
        return callback(null);
      });
    },
    checkInstalledPlugins: (callback) => {
      checkInstalledPlugins((err) => {
        if (err) {
          errFound = true;
        }
        return callback(null);
      });
    }
  }, () => {
    return callback(errFound);
  });
};
module.exports = {
  init
};