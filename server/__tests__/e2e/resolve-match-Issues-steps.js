const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');
const axios = require("axios");
const { defineFeature, loadFeature } = require( "jest-cucumber" );

const feature = loadFeature("../features/resolveMatchIssues.feature");

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
  test("Resolving match issue", ({ given, when, then }) => {
    let reqData;
    given("Resolve details", details => {
      reqData = JSON.parse(details);
    } );
    when("The POS sends resolve details", async() => {
      let url = URI(baseURL).segment('resolve-match-issue').toString();
      options.method = 'POST';
      options.url = url;
      options.data = reqData;
      response = await axios(options);
    } );
    then("The server responds with status code 200", () => {
      expect(response.status).toEqual(200);
    } );
  } );
} );

