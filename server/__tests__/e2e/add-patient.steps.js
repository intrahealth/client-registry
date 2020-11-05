const { defineFeature, loadFeature } = require( "jest-cucumber" )
const axios = require('axios')

const feature = loadFeature("../features/addPatient.feature")

defineFeature( feature, test => {
  test("Add a new Patient", ({ given, when, then }) => {
    let patient
    let response
    given("A new Patient", newPatient => {
      patient = JSON.parse(newPatient)
    } )
    when("The POS sends the Patient", async () => {
      console.log(patient)
      response = await axios.post( "http://localhost:3000/fhir/Patient", patient )
    } )
    then("The added Patient Location and CRID are returned", () => {
      expect(response.status).toBe(201)
      expect(response.header['Location']).toMatch(/http:\/\/localhost:3000\/fhir\/Patient\/\d+/)
    } )
  } )
} )

