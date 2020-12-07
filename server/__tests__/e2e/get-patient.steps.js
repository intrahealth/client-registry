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
    let patient;
    let response;
    given("Patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e exists on the server", existingPatient => {
      patient = JSON.parse(existingPatient);
    } );
    when("A system requests patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e", async() => {
      let url = URI(baseURL).segment('Patient').segment('76e82de7-26d5-4aa8-9e1c-b549a4184b7e').toString();
      options.method = 'GET';
      options.url = url;
      let resp = await axios(options);
      response = resp;
    } );
    then("Patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e is returned", () => {
      expect(response.data).toEqual(patient);
    } );
  } );
} );
