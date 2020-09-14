const express = require("express");
const router = express.Router();
const config = require('../config');

router.get('/getURI', (req, res) => {
  return res.status(200).json(config.get('systems'));
});

router.get('/getClients', (req, res) => {
  return res.status(200).json(config.get('clients'));
});

module.exports = router;