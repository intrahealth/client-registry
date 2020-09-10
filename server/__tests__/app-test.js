jest.mock('axios')

const DEFAULT_URL = "http://localhost:8081/clientregistry/fhir/"

const request = require("supertest")

const app = require("../lib/app")
const axios = require("axios")

describe( "Testing express", () => {
  test( "Testing FHIR route", () => {
    const MOCK_PATIENT = {
      resourceType: "Patient",
      id: "123"
    }
    axios.__setFhirResults( DEFAULT_URL + "Patient/123", null, MOCK_PATIENT )
    return request(app).get("/fhir/Patient/123").then( (response) => {
      console.log(response.body)
    } )
  } )
} )
