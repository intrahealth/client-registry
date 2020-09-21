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

describe( "Testing express", () => {
  test( "Testing FHIR route", () => {
    const MOCK_PATIENT = {
      resourceType: "Patient",
      id: "123",
      next: false
    };
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient/123`, null, JSON.stringify(MOCK_PATIENT) );
    return supertest(app).get("/Patient/123").then( (response) => {
      expect(response.body).toEqual(MOCK_PATIENT);
    } );
  } );

  test( "Testing Patient Submission", () => {
    const MOCK_CREATE_RESPONSE = {
      "resourceType": "Bundle",
      "id": "f66261d4-cfdf-4e84-82f4-69d0c1b15202",
      "type": "batch-response",
      "link": [
        {
          "relation": "self",
          "url": "http://localhost:8081/clientregistry/fhir"
        }
      ],
      "entry": [
        {
          "response": {
            "status": "201 Created",
            "etag": "1",
            "lastModified": "2020-09-18T08:22:40.031+03:00"
          }
        }
      ]
    };
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?identifier=http://clientregistry.org/openmrs|patient3&_include=Patient:link`, null, JSON.stringify(require("./FHIRResources/patient3andlink.json")) );
    request.__setFhirResults( `${ES_BASE_URL}/_refresh`, null, require("./ESResources/refreshindex.json"));
    request.__setFhirResults( `${ES_BASE_URL}/_search`, require("./ESResources/decisionruleforpatient3.json"), require("./ESResources/searchresultsforpatient3.json"));
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=bc58707b-62f1-498a-8fb3-568cd5b69db2,d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, null, JSON.stringify(require("./FHIRResources/potentialmatches.json")) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient/433ebeb6-1d89-4b64-97e6-a985675ca571/$meta-delete`, null, JSON.stringify({}));
    request.__setFhirResults( `${FHIR_BASE_URL}`, "POSTPatient", JSON.stringify(MOCK_CREATE_RESPONSE) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Basic/patientreport`, null, JSON.stringify(require("./FHIRResources/patientreport.json")));
    request.__setFhirResults( `${FHIR_BASE_URL}/StructureDefinition/Patient`, null, JSON.stringify(require("./FHIRResources/PatientStructureDefinition.json")));
    axios.__setFhirResults( `${ES_BASE_URL}/_cluster/settings`, {
      transient: {
        'script.max_compilations_rate': config.get('elastic:max_compilations_rate'),
      },
    }, {
      acknowledged: true,
      persistent: {},
      transient: {
        script: {
          max_compilations_rate: config.get('elastic:max_compilations_rate')
        }
      }
    });
    axios.__setFhirResults( `${ES_BASE_URL}`, require("./ESResources/indexSettings.json"), {
      acknowledged: true,
      shards_acknowledged: true,
      index: "patients"
    });
    axios.__setFhirResults( `${ES_BASE_URL}/_mapping`, require("./ESResources/indexMappings.json"), { acknowledged: true });
    axios.__setFhirResults( `${ES_BASE_URL}/_doc/bc58707b-62f1-498a-8fb3-568cd5b69db2`, require("./ESResources/cacheRequest-bc58707b-62f1-498a-8fb3-568cd5b69db2.json"), require("./ESResources/cacheResults-bc58707b-62f1-498a-8fb3-568cd5b69db2.json"));
    axios.__setFhirResults( `${ES_BASE_URL}/_doc/d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, require("./ESResources/cacheRequest-d55e15fd-d7a6-42b8-89cc-560e3578ef7f.json"), require("./ESResources/cacheResults-d55e15fd-d7a6-42b8-89cc-560e3578ef7f.json"));
    axios.__setFhirResults( `${ES_BASE_URL}/_doc/433ebeb6-1d89-4b64-97e6-a985675ca571`, require("./ESResources/cacheRequest-433ebeb6-1d89-4b64-97e6-a985675ca571.json"), require("./ESResources/cacheResults-433ebeb6-1d89-4b64-97e6-a985675ca571.json"));
    return supertest(app)
      .post("/Patient").set("x-openhim-clientid", "openmrs").send(PATIENT3).then( (response) => {
        expect(response.headers.location).toEqual("Patient/eda0fdeb-1d52-4878-a84f-ccf581ef9fff");
    } );
  } );

} );
