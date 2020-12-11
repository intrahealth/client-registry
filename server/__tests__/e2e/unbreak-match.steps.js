const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');
const axios = require("axios");
const { defineFeature, loadFeature } = require( "jest-cucumber" );

const feature = loadFeature("../features/unBreakMatch.feature");

const httpsAgent = new https.Agent({
  cert: fs.readFileSync('../server/sampleclientcertificates/openmrs_cert.pem'),
  key: fs.readFileSync('../server/sampleclientcertificates/openmrs_key.pem'),
  ca: fs.readFileSync('../server/certificates/server_cert.pem'),
  rejectUnauthorized: false,
});
const baseURL = 'https://localhost:3000/match';
const options = {
  httpsAgent
};
let response;

defineFeature( feature, test => {
  test("UnBreaking a match", ({ given, when, then }) => {
    let patientIDs;
    given("Patient IDs", ids => {
      patientIDs = JSON.parse(ids);
    } );
    when("The POS sends Patient IDS", async() => {
      let url = URI(baseURL).segment('unbreak-match').toString();
      options.method = 'POST';
      options.url = url;
      options.data = patientIDs;
      response = await axios(options);
    } );
    then("The server responds with status code 201", () => {
      expect(response.status).toEqual(201);
    } );
  } );
} );

