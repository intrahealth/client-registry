const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');
const axios = require("axios");
const { defineFeature, loadFeature } = require( "jest-cucumber" );

const feature = loadFeature("../features/addMultiplePatients.feature");

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
let response;

defineFeature( feature, test => {
  test("Add new multiple Patients", ({ given, when, then }) => {
    let patient;
    given("New multiple Patients", newPatient => {
      patient = JSON.parse(newPatient);
    } );
    when("The POS sends multiple Patients", async() => {
      let url = URI(baseURL).toString();
      options.method = 'POST';
      options.url = url;
      options.data = patient;
      response = await axios(options);
    } );
    then("The added Patient Location and CRID are returned", () => {
      expect(response.headers.location).toEqual(JSON.stringify([
        {
          "response": {
            "location": "Patient/9dd75a6a-2408-43d0-a577-d38292f4a73f"
          }
        }
      ]));
    } );
  } );
} );

