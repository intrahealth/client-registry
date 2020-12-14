const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');

const httpsAgent = new https.Agent({
  cert: fs.readFileSync('../server/sampleclientcertificates/openmrs_cert.pem'),
  key: fs.readFileSync('../server/sampleclientcertificates/openmrs_key.pem'),
  ca: fs.readFileSync('../server/certificates/server_cert.pem'),
  rejectUnauthorized: false,
});
const baseURL = 'https://localhost:3000/fhir';
const options = {
  httpsAgent
};

const axios = require("axios");

const { defineFeature, loadFeature } = require( "jest-cucumber" );
const feature = loadFeature("../features/getPatient.feature");

defineFeature( feature, test => {
  test("Get an existing patient", ({ given, when, then }) => {
    let patientID;
    let response;
    given("Patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f exists on the server", id => {
      patientID = id;
    } );
    when("A system requests patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f", async() => {
      let url = URI(baseURL).segment('Patient').segment('d55e15fd-d7a6-42b8-89cc-560e3578ef7f').toString();
      options.method = 'GET';
      options.url = url;
      let resp = await axios(options);
      response = resp;
    } );
    then("Patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f is returned", () => {
      expect(response.data.id).toEqual(patientID);
    } );
  } );
} );
