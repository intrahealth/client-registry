jest.mock('request');
jest.mock('axios');
const URI = require('urijs');
const config = require('../lib/config');
const FHIR_BASE_URL = URI(config.get('fhirServer:baseURL')).toString();
const ES_BASE_URL = URI(config.get('elastic:server')).segment(config.get('elastic:index')).toString();

const PATIENT3 = require("./FHIRResources/patient3.json");

const supertest = require("supertest");

const route = require("../lib/routes/fhir");

const express = require('express');
const app = express();
app.use(express.json());

const request = require("request");
const axios = require("axios");

app.use("/", route);

const { defineFeature, loadFeature } = require( "jest-cucumber" )
const feature = loadFeature("../features/getPatient.feature")

defineFeature( feature, test => {
  test("Get an existing patient", ({ given, when, then }) => {
    let patient
    let response
    given("Patient 123 exists on the server", existingPatient => {
      request.__setFhirResults( `${FHIR_BASE_URL}/Patient/123`, null, existingPatient );
      patient = JSON.parse(existingPatient)
    } )
    when("A system requests patient 123", async () => {
      response = await supertest(app).get("/Patient/123")
    } )
    then("Patient 123 is returned", () => {
      expect(response.body).toEqual(patient)
    } )
  } )
} )
