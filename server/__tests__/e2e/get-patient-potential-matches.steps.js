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
  "id": "04cdafc2-cc7b-435e-bd5b-0ee12a2367b7",
  "gender": "male",
  "given": "Mahengenya",
  "family": "Masunga",
  "birthDate": "1980-01-08",
  "phone": "0678 111177",
  "uid": "74bf4455-20e3-4acc-9fe1-888898ceb815",
  "ouid": "74bf4455-20e3-4acc-9fe1-888898ceb815",
  "source_id": "patient10",
  "source": "OpenMRS",
  "scores": {
    "patient11": 2
  }
}, {
  "id": "c5c94f59-3c8c-4636-b747-235fbe55f80a",
  "gender": "male",
  "given": "Mahengenya",
  "family": "Masunga",
  "birthDate": "1980-01-08",
  "phone": "0678 11177",
  "uid": "0db56938-46b5-4d8f-83e5-d3d4b96248db",
  "ouid": "0db56938-46b5-4d8f-83e5-d3d4b96248db",
  "source_id": "patient11",
  "source": "OpenMRS",
  "scores": {
    "patient10": 2
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

