jest.mock('request')

const DEFAULT_URL = "http://localhost:8081/clientregistry/fhir/"

const supertest = require("supertest")

const route = require("../lib/routes/fhir")

const express = require('express')
const app = express()
app.use(express.json())

const request = require("request")

app.use("/", route)

describe( "Testing express", () => {
  test( "Testing FHIR route", () => {
    const MOCK_PATIENT = {
      resourceType: "Patient",
      id: "123",
      next: false
    }
    request.__setFhirResults( DEFAULT_URL + "Patient/123", null, JSON.stringify(MOCK_PATIENT) )
    return supertest(app).get("/Patient/123").then( (response) => {
      expect(response.body).toEqual(MOCK_PATIENT)
    } )
  } )
} )
