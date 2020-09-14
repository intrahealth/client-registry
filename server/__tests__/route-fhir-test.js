jest.mock('request')

const DEFAULT_URL = "http://localhost:8081/clientregistry/fhir/"

const supertest = require("supertest")

const app = require("../lib/app")
const request = require("request")

describe( "Testing express", () => {
  test( "Testing FHIR route", () => {
    const MOCK_PATIENT = {
      resourceType: "Patient",
      id: "123"
    }
    request.__setFhirResults( DEFAULT_URL + "Patient/123", null, MOCK_PATIENT )
    return supertest(app).get("/Patient/123").then( (response) => {
      console.log(response.body)
    } )
  } )
} )
