const nconf = require('nconf');
const env = process.env.NODE_ENV || 'development';
nconf.argv()
  .env()
  .file(`${__dirname}/../config/config_${env}.json`)
  .file('decRules', `${__dirname}/../config/decision_rules.json`);
module.exports = nconf;