const express = require("express");
const router = express.Router();
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
            url: "role",
            valueString: fields.role
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

router.post('/editUser', (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    let url = URI(config.get('fhirServer:baseURL')).segment("Person").segment(fields.id);
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
        logger.error('Non JSON has been returned while getting data for resource ');
        return res.status(401).json(body);
      }
      body = JSON.parse(body);
      const name = {
        given: [fields.firstName],
        family: fields.surname
      };
      if (fields.otherName) {
        name.given.push(fields.otherName);
      }
      body.name = [name];
      let userExt = body.extension.find((ext) => {
        return ext.url === 'http://openclientregistry.org/fhir/StructureDefinition/OCRUserDetails';
      });
      let roleUpdated = false;
      let statusUpdated = false;
      for(let ext of userExt.extension) {
        if(ext.url === 'role') {
          ext.valueString = fields.role;
          roleUpdated = true;
        }
        if(ext.url === 'status') {
          ext.valueString = fields.status;
          statusUpdated = true;
        }
      }
      if(!roleUpdated) {
        userExt.extension.push({
          url: 'role',
          valueString: fields.role
        });
      }
      if(!statusUpdated) {
        userExt.extension.push({
          url: 'status',
          valueString: fields.status
        });
      }
      const url = URI(config.get('fhirServer:baseURL')).segment("Person").segment(fields.id).toString();
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
        json: body
      };
      request.put(options, (err, resp, body) => {
        if (err) {
          return res.status(400).json(err);
        }
        console.log('saved');
        return res.status(200).send("User Changed");
      });
    });
  });
});

router.get('/getUsers', (req, res) => {
  let url = URI(config.get('fhirServer:baseURL')).segment("Person");
  url.addQuery('_count', 50);
  url = url.toString();

  const options = {
    url,
    withCredentials: true,
    auth: {
      username: config.get('fhirServer:username'),
      password: config.get('fhirServer:password'),
    }
  };
  const users = [];
  request.get(options, (err, response, body) => {
    if(err) {
      console.log(err);
      return res.status(500).json();
    }
    body = JSON.parse(body);
    for(const entry of body.entry) {
      let userExt = entry.resource.extension.find((ext) => {
        return ext.url === 'http://openclientregistry.org/fhir/StructureDefinition/OCRUserDetails';
      });
      let user = {};
      if(entry.resource.name && Array.isArray(entry.resource.name) && entry.resource.name.length > 0) {
        let names = entry.resource.name[0].given;
        user.firstName = names.shift();
        user.otherName = names.join(" ");
        user.surname = entry.resource.name[0].family;
      }
      user.userName = userExt.extension.find((ext) => {
        return ext.url === 'username';
      }).valueString;
      const role = userExt.extension.find((ext) => {
        return ext.url === 'role';
      });
      const status = userExt.extension.find((ext) => {
        return ext.url === 'status';
      });
      if(status) {
        user.status = status.valueString;
      } else {
        user.status = 'active';
      }
      if(role) {
        user.role = role.valueString;
      } else {
        user.role = 'admin';
      }
      user.id = entry.resource.id;
      users.push(user);
    }
    res.status(200).json(users);
  });
});

router.post("/changepassword", (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    let url = URI(config.get('fhirServer:baseURL')).segment("Person");
    url.addQuery('username:exact', fields.username);
    url = url.toString();

    const options = {
      url,
      withCredentials: true,
      auth: {
        username: config.get('fhirServer:username'),
        password: config.get('fhirServer:password'),
      },
      headers: {
        'Cache-Control': 'no-cache',
      }
    };
    request.get(options, (err, response, body) => {
      if (!isJSON(body)) {
        logger.error(body);
        logger.error('Non JSON has been returned while getting user information for user ' + req.query.username);
        return res.status(500).json({
          info: "Internal Error Occured"
        });
      }
      body = JSON.parse(body);
      const numMatches = body.total;
      if (numMatches == 0) {
        return res.status(400).send("Cant find user " + fields.username);
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
              fields.password,
              salt,
              1000,
              64,
              "sha512"
            ).toString("hex");
  
            // matching password
            if (hash === password) {
              const salt = crypto.randomBytes(16).toString('hex');
              const password = crypto.pbkdf2Sync(
                fields.newpassword,
                salt,
                1000,
                64,
                "sha512"
              ).toString("hex");
              for (const j in userDetails) {
                if (userDetails[j].url == "password") {
                  userDetails[j].valueString = password;
                }
                if (userDetails[j].url == "salt") {
                  userDetails[j].valueString = salt;
                }
              }
              const url = URI(config.get('fhirServer:baseURL')).segment("Person").segment(user.id).toString();
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
                json: user
              };
              request.put(options, (err, resp, body) => {
                if (err) {
                  return res.status(400).json(err);
                }
                return res.status(200).send("Password Changed");
              });
            } else {
              return res.status(400).json("Password mismatch");
            }
          }
        }
      }
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
    },
    headers: {
      'Cache-Control': 'no-cache',
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
          let status = null;
          let role = null;

          for (var j in userDetails) {
            if (userDetails[j].url == "status") {
              status = userDetails[j].valueString;
            }
            if (userDetails[j].url == "role") {
              role = userDetails[j].valueString;
            }
            if (userDetails[j].url == "password") {
              password = userDetails[j].valueString;
            }

            if (userDetails[j].url == "salt") {
              salt = userDetails[j].valueString;
            }
          }

          if(status === 'inactive') {
            return res.status(401).json({});
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
              username: req.query.username,
              role
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