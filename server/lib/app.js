'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./winston');
const config = require('./config');

const app = express();
app.use(bodyParser.json());


app.listen(config.get('server:port'), () => {
  logger.info(`Server is running and listening on port: ${config.get('server:port')}`);
});