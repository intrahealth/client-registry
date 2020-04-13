# Configuration

Often there are many records of the same person but in many people in different systems. The purpose of the Client Registry is to link patients in different systems, but not to transfer any data, neither clinical records nor demographic data. 

!!! caution 
    The Client Registry does not store clinical information. Having the Client Registry enables the ability to create a Shared Health Record in the future.

The Client Registry stores the patient demographic data submitted to it in queries. The Client Registry stores demographic data at least in the HAPI FHIR Server, which can have any database backend an implementer chooses to use. 

ElasticSearch (ES) is an optional search engine, and requires configuration. ES can also store patient data fields selectably.

JSON files are used to configure the system. Later iterations will support environment variables and a graphical interface. See https://github.com/openhie/client-registry/tree/master/server/config for example configuration files discussed here.


## Deciding Between a Standalone or Mediator Configuration

A central application is the Client Registry Service, as distinct from the larger Client Registry platform. There are two options for running the application, as an OpenHIM mediator or as standalone application. 

Choose running the app standalone when:

* For testing, demonstration, or development environments.
* There are few clients that will connect to managing client authentication and roles will not be a burden.
* There is no need for an additional layer of auditing.

Choose running the app as a mediator when:

* For production. The central application should be run as a mediator registered in OpenHIM.
* There are many clients that will need to connect.
* There is a need to audit transactions.
* There is an existing health information exchange layer or OpenHIM.
* One advantage of using the OpenHIM interface is the ability to change settings like the FHIR server.

## Security and Privacy

Many configuration options relate to privacy and security. These steps are critical to address. See the [security page](security.md)

Whether in standalone or as a mediator, the Client Registry must interact only with known, trusted clients with TLS certificates. Clients must be registered and certificates assigned to them.

In standalone mode, the server runs TLS by default, and requires signed certificates. Client certificate needs can be turned off in OpenHIM when running as a mediator and this feature must be regularly audited to ensure security.

## Connecting Services

The default ports are as follows:

* **3000**: Client Registry Service
* **9200**: ElasticSearch (closed to external)
* **8080**: HAPI FHIR Server (closed to external)

In `server/config/config_development_template.json` there is a template for configuration.

[Link to file](https://github.com/openhie/client-registry/blob/master/server/config/config_development_template.json)

Contents of `server/config/config_development_template.json`
```json
{
  "app": {
    "port": 3000,
    "installed": false
  },
  "mediator": {
    "api": {
      "username": "root@openhim.org",
      "password": "openhim-password",
      "apiURL": "https://localhost:8080",
      "trustSelfSigned": true,
      "urn": ""
    },
    "register": false
  },
  "fhirServer": {
    "baseURL": "http://localhost:8080/clientregistry/fhir",
    "username": "hapi",
    "password": "hapi"
  },
  "elastic": {
    "server": "http://localhost:9200",
    "username": "",
    "password": "",
    "max_compilations_rate": "10000/1m",
    "index": "patients"
  },
  "structureDefinition": {
    "reportRelationship": "patientreport"
  },
  "matching": {
    "tool": "mediator"
  },
  "systems": {
    "openmrs": {
      "uri": "http://clientregistry.org/openmrs"
    },
    "dhis2": {
      "uri": "http://clientregistry.org/dhis2"
    },
    "lims": {
      "uri": "http://clientregistry.org/lims"
    },
    "brokenMatch": {
      "uri": "http://ihris.org/CR/brokenMatch"
    }
  },
  "sync": {
    "lastFHIR2ESSync": "1970-01-01T00:00:06"
  },
  "__comments": {
    "matching.tool": "this tells if the app should use mediator algorithms or elasticsearch algorithms for matching, two options mediator and elasticsearch"
  }
}

```

### General App Configuration

`app.port` is the port the application will run on. 

`app.installed` can be left to True. This tells the Client Registry Service to load structure definitions into HAPI FHIR Server, otherwise it will not.

### Mediator App Configuration

`mediator.register` to true if the application will run as a mediator. Or, to false if the app will run as standalone.

`mediator.api.xx` settings are only if running as a mediator. 

`mediator.api.username | password` must be different. The existing settings are defaults and must be changed when configuring the OpenHIM.

`mediator.api.trustSelfSigned` should be set to false in production or any sensitive environment. True is only for demonstrations.

### FHIR Server

The currently supported FHIR version is R4.

`fhirServer.baseURL` is the default. Note that it may change depending on the way HAPI is installed. It may, for example, default to a baseURL of http://localhost:8080/baseR4/.

`fhirServer.username | password` must be changed from defaults in HAPI.


### ElasticSearch Configuration

For ES, the relationship between patient resources in FHIR and what fields are synchronized in ES must be explicitly defined. This is termed the Report Relationship mapping. One must define what resource to be used (patient) and what fields need to be available in ES. After this, the Client Registry reads these fields, and populates ES with the information.


In `resources/Relationships/PatientRelationship.json` there is a template for configuration.

[Link to file](https://github.com/intrahealth/client-registry/blob/master/resources/Relationships/PatientRelationship.json)

Contents of `resources/Relationships/PatientRelationship.json`

```json
{
  "resourceType": "Basic",
  "id": "patientreport",
  "meta": {
    "versionId": "1",
    "lastUpdated": "2019-07-30T07:34:24.098+00:00",
    "profile": [
      "http://ihris.org/fhir/StructureDefinition/iHRISRelationship"
    ]
  },
  "extension": [{
    "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportDetails",
    "extension": [{
      "url": "label",
      "valueString": "Patient Report"
    }, {
      "url": "name",
      "valueString": "patients"
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "gender"
      }, {
        "url": "name",
        "valueString": "gender"
      }]
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "birthDate"
      }, {
        "url": "name",
        "valueString": "birthDate"
      }]
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "given"
      }, {
        "url": "name",
        "valueString": "name.where(use='official').last().given"
      }]
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "family"
      }, {
        "url": "name",
        "valueString": "name.where(use='official').last().family"
      }]
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "fullname"
      }, {
        "url": "name",
        "valueString": "name.where(use='official').last().text"
      }]
    }, {
      "url": "http://ihris.org/fhir/StructureDefinition/iHRISReportElement",
      "extension": [{
        "url": "label",
        "valueString": "phone"
      }, {
        "url": "name",
        "valueString": "telecom.where(system='phone').value"
      }]
    }]
  }],
  "code": {
    "coding": [{
      "system": "http://ihris.org/fhir/ValueSet/ihris-resource",
      "code": "iHRISRelationship"
    }],
    "text": "iHRISRelationship"
  },
  "subject": {
    "reference": "StructureDefinition/Patient"
  }
}

```


### OpenHIM Mediator JSON Configuration

If using OpenHIM, it must be configured for proper clients and roles to accept and forward requests from the Client Registry. An example export of a working JSON configuration that can be imported for development purposes is available.


[Link to file](https://github.com/openhie/client-registry/blob/master/server/config/mediator.json)

Contents of `server/config/mediator.json`
```json
    {
      "urn": "urn:uuid:4bc42b2f-b5a8-473d-8207-5dd5c61f0c4a",
      "version": "0.0.1",
      "name": "Client Registry",
      "description": "Uganda Client Registry",
      "config": {
        "fhirServer": {
          "username": "hapi",
          "password": "hapi",
          "baseURL": "http://localhost:8080/hapi/fhir"
        },
        "elastic": {
          "server": "http://localhost:9200",
          "username": "",
          "password": "",
          "max_compilations_rate": "10000/1m",
          "index": "patients"
        },
        "matching": {
          "tool": "elasticsearch"
        }
      },
      "configDefs": [{
        "param": "fhirServer",
        "displayName": "FHIR Server",
        "description": "FHIR Server Configuration Details",
        "type": "struct",
        "template": [{
            "type": "string",
            "description": "The base URL (e.g. http://localhost:8080/hapi/fhir)",
            "displayName": "Base URL",
            "param": "baseURL"
          },
          {
            "type": "string",
            "description": "Username required to access FHIR server",
            "displayName": "Username",
            "param": "username"
          },
          {
            "type": "password",
            "description": "Password required to access FHIR server",
            "displayName": "Password",
            "param": "password"
          }
        ],
        "values": []
      }, {
        "param": "elastic",
        "displayName": "Elasticsearch Server",
        "description": "Elasticsearch Server Configuration Details",
        "type": "struct",
        "template": [{
            "type": "string",
            "description": "The base URL (e.g. http://localhost:9200)",
            "displayName": "Base URL",
            "param": "server"
          },
          {
            "type": "string",
            "description": "Username required to access elasticsearch server",
            "displayName": "Username",
            "param": "username"
          },
          {
            "type": "password",
            "description": "Password required to access elasticsearch server",
            "displayName": "Password",
            "param": "password"
          }, {
            "type": "string",
            "description": "Number of requests to compile per minute",
            "displayName": "Maximum Compilations Rate",
            "param": "max_compilations_rate"
          }, {
            "type": "string",
            "description": "index to use for data storage",
            "displayName": "Index Name",
            "param": "index"
          }
        ],
        "values": []
      }, {
        "param": "matching",
        "displayName": "FHIR Server",
        "description": "FHIR Server Configuration Details",
        "type": "struct",
        "template": [{
          "type": "option",
          "values": ["mediator", "elasticsearch"],
          "description": "Tool to Use for Matching",
          "displayName": "Tool to Use for Matching",
          "param": "tool"
        }],
        "values": []
      }],
      "defaultChannelConfig": [{
        "requestBody": true,
        "responseBody": true,
        "name": "Add Patients",
        "description": "Post a new patient into the client registry",
        "urlPattern": "/addPatient",
        "matchContentRegex": null,
        "matchContentXpath": null,
        "matchContentValue": null,
        "matchContentJson": null,
        "pollingSchedule": null,
        "tcpHost": null,
        "tcpPort": null,
        "autoRetryPeriodMinutes": 60,
        "autoRetryEnabled": false,
        "rewriteUrlsConfig": [],
        "addAutoRewriteRules": true,
        "rewriteUrls": false,
        "status": "enabled",
        "alerts": [],
        "txRerunAcl": [],
        "txViewFullAcl": [],
        "txViewAcl": [],
        "properties": [],
        "matchContentTypes": [],
        "routes": [{
          "name": "Add Patient",
          "secured": false,
          "host": "localhost",
          "port": 3000,
          "path": "/addPatient",
          "pathTransform": "",
          "primary": true,
          "username": "",
          "password": "",
          "forwardAuthHeader": false,
          "status": "enabled",
          "type": "http"
        }],
        "authType": "public",
        "whitelist": [],
        "allow": [],
        "type": "http",
        "methods": [
          "POST"
        ]
      }],
      "endpoints": [{
        "name": "Activate Client Registry",
        "host": "localhost",
        "path": "/addPatient",
        "port": 3000,
        "primary": true,
        "forwardAuthHeader": false,
        "status": "enabled",
        "type": "http"
      }],
      "_uptime": 2201.945,
      "_lastHeartbeat": "2017-12-15T03:47:03.365Z",
      "_configModifiedTS": "2017-12-15T02:52:49.054Z"
    }
```