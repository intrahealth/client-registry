var express = require("express");
var router = express.Router();
const request = require('request');
const URI = require("urijs");
const jwt = require('jsonwebtoken');
const formidable = require('formidable');
const isJSON = require('is-json');
const crypto = require("crypto");
const config = require('../config');
const logger = require('../winston');

/**
 * Add a new user
 */
router.post("/addUser", function (req, res, next) {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    let url = URI(config.get('fhirServer:baseURL')).segment("Person");
    url.addQuery('username:exact', fields.userName);
    url = url.toString();

    const options = {
      url,
      withCredentials: true,
      auth: {
        username: config.get('fhirServer:username'),
        password: config.get('fhirServer:password'),
      }
    };
    request.get(options, (err, response, body) => {
      if (!isJSON(body)) {
        logger.error(options);
        logger.error(body);
        logger.error('Non JSON has been returned while getting data for resource ' + resource);
        return res.status(401).json(body);
      }
      body = JSON.parse(body);
      const numMatches = body.total;
      if (numMatches > 0) {
        return res.status(400).send();
      }

      const now = new Date();
      const salt = crypto.randomBytes(16).toString('hex');
      const password = crypto.pbkdf2Sync(
        fields.password,
        salt,
        1000,
        64,
        "sha512").toString("hex");
      const created = now.toISOString();
      const name = {
        given: [fields.firstName],
        family: fields.surname
      };
      if (fields.otherName) {
        name.given.push(fields.otherName);
      }
      const bundle = {
        resourceType: "Person",
        id: "user",
        name: [name],
        extension: [{
          url: URI(config.get('structureDefinition:uri')).segment("StructureDefinition").segment("OCRUserDetails").toString(),
          extension: [{
            url: "username",
            valueString: fields.userName
          }, {
            url: "password",
            valueString: password
          }, {
            url: "salt",
            valueString: salt
          }, {
            url: "created",
            valueString: created
          }]
        }]
      };

      const url = URI(config.get('fhirServer:baseURL')).segment("Person").toString();
      const options = {
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        withCredentials: true,
        auth: {
          username: config.get('fhirServer:username'),
          password: config.get('fhirServer:password'),
        },
        json: bundle,
      };
      request.post(options, (err, response, body) => {
        if (err) {
          return res.status(400).json(err);
        }
        res.status(201).json(body);
      });
    });
  });
});
/**
 * Check login credentials
 */
router.post("/authenticate", function (req, res, next) {
  let url = URI(config.get('fhirServer:baseURL')).segment("Person");
  url.addQuery('username:exact', req.query.username);
  url = url.toString();

  const options = {
    url,
    withCredentials: true,
    auth: {
      username: config.get('fhirServer:username'),
      password: config.get('fhirServer:password'),
    }
  };
  request.get(options, (err, response, body) => {
    if (!isJSON(body)) {
      logger.error(options);
      logger.error(body);
      logger.error('Non JSON has been returned while getting user information for user ' + req.query.username);
      return res.status(401).json(body);
    }
    body = JSON.parse(body);
    const numMatches = body.total;
    if (numMatches == 0) {
      return res.status(200).json({
        token: null,
        role: null,
        userID: null,
      });
    } else {
      const user = body.entry[0].resource;
      const extensions = user.extension;

      for (var i in extensions) {
        if (extensions[i].url.includes("OCRUserDetails")) {
          const userDetails = extensions[i].extension;
          let password = null;
          let salt = null;

          for (var j in userDetails) {
            if (userDetails[j].url == "password") {
              password = userDetails[j].valueString;
            }

            if (userDetails[j].url == "salt") {
              salt = userDetails[j].valueString;
            }
          }

          const hash = crypto.pbkdf2Sync(
            req.query.password,
            salt,
            1000,
            64,
            "sha512"
          ).toString("hex");

          // matching password
          if (hash === password) {
            const tokenDuration = config.get('auth:tokenDuration');
            const secret = config.get('auth:secret');
            const token = jwt.sign({
              id: user.id,
            }, secret, {
              expiresIn: tokenDuration,
            });
            logger.info(`Successfully Authenticated user ${req.query.username}`);
            return res.status(200).json({
              token,
              userID: user.id,
              username: req.query.username
            });
          } else {
            return res.status(400).json({});
          }
        }
      }

      res.status(400).json({});
    }
  });
});

module.exports = router;