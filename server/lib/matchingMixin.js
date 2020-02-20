const config = require('./config');

const isMatchBroken = (resourceData, reference) => {
  let isBroken = resourceData.extension && resourceData.extension.find((extension) => {
    return extension.url === config.get("systems:brokenMatch:uri") && extension.valueReference.reference === reference;
  });
  return isBroken;
}
module.exports = {
  isMatchBroken
}