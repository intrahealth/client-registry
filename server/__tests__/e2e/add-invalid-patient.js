const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');
const axios = require("axios");
const { defineFeature, loadFeature } = require( "jest-cucumber" );

const feature = loadFeature("../features/addInvalidPatient.feature");

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
  test("Add invalid patient", ({ given, when, then }) => {
    let patient;
    given("Patient data", newPatient => {
      patient = JSON.parse(newPatient);
    } );
    when("The POS sends the Patient", async() => {
      let url = URI(baseURL).segment('Patient').toString();
      options.method = 'POST';
      options.url = url;
      options.data = patient;
      response = await axios(options);
    } );
    then("The server responds with status code 400", () => {
      expect(response.status).toEqual(400);
    } );
  } );
} );

