const nconf = require('nconf');
const env = process.env.NODE_ENV || 'development';
let decisionRulesFile;
if(env === 'test') {
  decisionRulesFile = `${__dirname}/../config/decisionRulesTest.json`;
} else {
  decisionRulesFile = `${__dirname}/../config/decisionRules.json`;
}
nconf.argv()
  .env({separator:'__'})
  .file(`${__dirname}/../config/config_${env}.json`)
  .file('decRules', decisionRulesFile);
module.exports = nconf;