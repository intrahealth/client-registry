jest.mock('request');
jest.mock('axios');
const fs = require('fs');
const URI = require('urijs');
const config = require('../lib/config');
const FHIR_BASE_URL = URI(config.get('fhirServer:baseURL')).toString();
const ES_BASE_URL = URI(config.get('elastic:server')).segment(config.get('elastic:index')).toString();

const supertest = require("supertest");

const route = require("../lib/routes/match");

const express = require('express');
const app = express();
app.use(express.json());

const request = require("request");
const axios = require("axios");

app.use("/", route);

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

describe( "Testing express", () => {
  test( "Testing Breaking Matches", () => {
    const ids = [ 'Patient/d55e15fd-d7a6-42b8-89cc-560e3578ef7f' ];
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=Patient/d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, null, JSON.stringify(
      {
        "entry": [{
          "resource": require("./FHIRResources/patient2.json")
        }]
      }
    ) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=739d4023-40eb-4f44-8d14-3355926bd60d`, null, JSON.stringify(
      {
        "entry": [{
          "resource": require("./FHIRResources/goldenrecord-739d4023-40eb-4f44-8d14-3355926bd60d.json")
        }]
      }
    ) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=bc58707b-62f1-498a-8fb3-568cd5b69db2`, null, JSON.stringify(
      {
        "entry": [{
          "resource": require("./FHIRResources/patient1.json")
        }]
      }
    ) );
    request.__setFhirResults( `${FHIR_BASE_URL}`, "POSTPatient", JSON.stringify(MOCK_CREATE_RESPONSE) );
    return supertest(app)
      .post("/break-match").send(ids).then( (response) => {
        expect(response.statusCode).toBe(200);
    } );

  });

  test( "Testing UnBreaking Matches", () => {
    const ids = [
      {
        id2: 'Patient/bc58707b-62f1-498a-8fb3-568cd5b69db2',
        id1: 'Patient/433ebeb6-1d89-4b64-97e6-a985675ca571'
      },
      {
        id2: 'Patient/bc58707b-62f1-498a-8fb3-568cd5b69db2',
        id1: 'Patient/d55e15fd-d7a6-42b8-89cc-560e3578ef7f'
      }
    ];
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=Patient/433ebeb6-1d89-4b64-97e6-a985675ca571,Patient/bc58707b-62f1-498a-8fb3-568cd5b69db2,Patient/d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, null, JSON.stringify(
      require("./FHIRResources/unbreakmatchresources.json")
    ) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?identifier=http://clientregistry.org/openmrs|patient1&_include=Patient:link`, null, JSON.stringify(require("./FHIRResources/patient1andlinkAfterBrokenMatchWithoutRematch.json")) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?identifier=http://clientregistry.org/openmrs|patient2&_include=Patient:link`, null, JSON.stringify(require("./FHIRResources/patient2andlinkAfterBrokenMatchWithoutRematch.json")) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?identifier=http://clientregistry.org/openmrs|patient3&_include=Patient:link`, null, JSON.stringify(require("./FHIRResources/patient3andlinkAfterBrokenMatchWithoutRematch.json")) );
    request.__setFhirResults( `${ES_BASE_URL}/_refresh`, null, require("./ESResources/refreshindex.json"));
    request.__setFhirResults( `${ES_BASE_URL}/_search`, require("./ESResources/decisionruleforpatient1.json"), require("./ESResources/searchresultsforpatient1.json"));
    request.__setFhirResults( `${ES_BASE_URL}/_search`, require("./ESResources/decisionruleforpatient2.json"), require("./ESResources/searchresultsforpatient2.json"));
    request.__setFhirResults( `${ES_BASE_URL}/_search`, require("./ESResources/decisionruleforpatient3.json"), require("./ESResources/searchresultsforpatient3.json"));

    const brokenPatient3 = require("./FHIRResources/patient3andlinkAfterBrokenMatchWithoutRematch.json");
    const brokenPatient1 = require("./FHIRResources/patient1andlinkAfterBrokenMatchWithoutRematch.json");
    const brokenPatient2 = require("./FHIRResources/patient2andlinkAfterBrokenMatchWithoutRematch.json");

    const patient3 = brokenPatient3.entry.find((entry) => {
      return entry.resource.identifier.find((id) => {
        return id.value === 'patient3';
      });
    });
    const patient3Bundle = {
      entry: [{
        resource: patient3.resource
      }]
    };

    const patient1 = brokenPatient1.entry.find((entry) => {
      return entry.resource.identifier.find((id) => {
        return id.value === 'patient1';
      });
    });
    const patient2 = brokenPatient2.entry.find((entry) => {
      return entry.resource.identifier.find((id) => {
        return id.value === 'patient2';
      });
    });
    const patient1and2Bundle = {
      entry: [{
        resource: patient1.resource
      }, {
        resource: patient2.resource
      }]
    };
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=433ebeb6-1d89-4b64-97e6-a985675ca571`, null, JSON.stringify(patient3Bundle) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=bc58707b-62f1-498a-8fb3-568cd5b69db2&_include=Patient:link`, null, JSON.stringify(brokenPatient1) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=d55e15fd-d7a6-42b8-89cc-560e3578ef7f&_include=Patient:link`, null, JSON.stringify(brokenPatient2) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=bc58707b-62f1-498a-8fb3-568cd5b69db2,d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, null, JSON.stringify(patient1and2Bundle) );
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=d55e15fd-d7a6-42b8-89cc-560e3578ef7f,bc58707b-62f1-498a-8fb3-568cd5b69db2`, null, JSON.stringify(patient1and2Bundle) );

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
      .post("/unbreak-match").send(ids).then( (response) => {
        expect(response.statusCode).toBe(201);
    } );

  });

  test( "Testing Count Match Issues", () => {
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_tag=http://openclientregistry.org/fhir/matchIssues|potentialMatches,http://openclientregistry.org/fhir/matchIssues|conflictMatches&_summary=count`, null, JSON.stringify(require("./FHIRResources/totalMatchIssues.json")) );
    return supertest(app)
      .get("/count-match-issues").send().then( (response) => {
        expect(response.statusCode).toBe(200);
        expect(response.body.total).toEqual(1);
    } );
  });

  //testing getting potential matches
  test( "Testing Getting Potential Matches", () => {
    const potentialMatches = require("./otherResources/potentialMatches.json");
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient/433ebeb6-1d89-4b64-97e6-a985675ca571`, null, JSON.stringify(require("./FHIRResources/patient3.json")) );
    return supertest(app)
      .get("/potential-matches/433ebeb6-1d89-4b64-97e6-a985675ca571").send().then( (response) => {
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(potentialMatches);
    } );
  });

  test( "Testing Getting Match Issues", () => {
    const allMatchIssues = require("./FHIRResources/allMatchIssues.json");
    const allMatchIssuesRes = require("./otherResources/allMatchIssues.json");
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_tag=http://openclientregistry.org/fhir/matchIssues|potentialMatches,http://openclientregistry.org/fhir/matchIssues|conflictMatches`, null, JSON.stringify(allMatchIssues) );
    return supertest(app)
      .get("/get-match-issues").send().then( (response) => {
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(allMatchIssuesRes);
    } );
  });

  test( "Testing Resolving Match Issues", () => {
    const resolveIssuesReqBundle = require("./otherResources/requestResolveIssue.json");
    request.__setFhirResults( `${FHIR_BASE_URL}/Patient?_id=433ebeb6-1d89-4b64-97e6-a985675ca571,c49a52c1-88bc-41fb-9c87-bdd2a911f360,739d4023-40eb-4f44-8d14-3355926bd60d,bc58707b-62f1-498a-8fb3-568cd5b69db2,d55e15fd-d7a6-42b8-89cc-560e3578ef7f`, null, JSON.stringify(
      require("./FHIRResources/allMatchIssuesWithLinks.json")
    ) );
    return supertest(app)
      .post("/resolve-match-issue").send(resolveIssuesReqBundle).then( (response) => {
        expect(response.statusCode).toBe(200);
    } );
  });
} );
