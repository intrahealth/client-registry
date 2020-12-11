const URI = require('urijs');
const https = require('https');
jest.unmock('axios');
const fs = require('fs');
const axios = require("axios");
const { defineFeature, loadFeature } = require( "jest-cucumber" );

const feature = loadFeature("../features/getPatientPotentialMatches.feature");

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
let potentialMatches = [{
  "id": "433ebeb6-1d89-4b64-97e6-a985675ca571",
  "gender": "male",
  "given": "Emanuel",
  "family": "Joshua",
  "birthDate": "1972-01-08",
  "phone": "0678 56160",
  "uid": "fe697ff3-62c5-4aa3-8747-ccb15a2ee9c3",
  "ouid": "fe697ff3-62c5-4aa3-8747-ccb15a2ee9c3",
  "source_id": "patient5",
  "source": "OpenMRS",
  "scores": {
    "patient2": 2,
    "patient4": 2,
    "patient1": 2
  }
}, {
  "id": "d55e15fd-d7a6-42b8-89cc-560e3578ef7f",
  "gender": "male",
  "given": "Emanuel",
  "family": "Joshua",
  "birthDate": "1972-01-08",
  "phone": "0678 561608",
  "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "source_id": "patient2",
  "source": "OpenMRS",
  "scores": {
    "patient4": 3,
    "patient1": 3,
    "patient5": 2
  }
}, {
  "id": "6f017270-a089-4b23-a667-3f8508412ca0",
  "gender": "male",
  "given": "Emanueel",
  "family": "Joshua",
  "birthDate": "1972-01-08",
  "phone": "0678 561608",
  "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "source_id": "patient4",
  "source": "OpenMRS",
  "scores": {
    "patient2": 3,
    "patient1": 3,
    "patient5": 2
  }
}, {
  "id": "3fe45cb4-1a1b-4e3b-a064-0a83df6164f2",
  "gender": "male",
  "given": "Emmanuel",
  "family": "Joshua",
  "birthDate": "1972-01-08",
  "phone": "0678 561608",
  "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
  "source_id": "patient1",
  "source": "OpenMRS",
  "scores": {
    "patient2": 3,
    "patient4": 3,
    "patient5": 2
  }
}];
defineFeature( feature, test => {
  test("Get patient match", ({ given, when, then }) => {
    let patientID;
    given("Patient ID", id => {
      patientID = id;
    } );
    when("The POS sends patient ID", async() => {
      let url = URI(baseURL).segment('potential-matches').segment(patientID).toString();
      options.method = 'GET';
      options.url = url;
      response = await axios(options);
    } );
    then("Potential matches are returned", () => {
      expect(response.data).toEqual(potentialMatches);
    } );
  } );
} );

