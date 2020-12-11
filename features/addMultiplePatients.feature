Feature: Submit Multiple Patient


Scenario: Add new multiple Patients
    Given New multiple Patients
      """
      {
        "resourceType": "Bundle",
        "type": "batch",
        "entry": [{
          "resource": {
            "id": "3fe45cb4-1a1b-4e3b-a064-0a83df6164f2",
            "resourceType": "Patient",
            "identifier": [{
                "system": "http://clientregistry.org/openmrs",
                "value": "patient1"
              },
              {
                "system": "http://health.go.ug/cr/nationalid",
                "value": "228374844"
              },
              {
                "system": "http://system1.org",
                "value": "12347",
                "period": {
                  "start": "2001-05-07"
                },
                "assigner": {
                  "display": "test Org"
                }
              }
            ],
            "active": true,
            "name": [{
              "use": "official",
              "family": "Joshua",
              "given": [
                "Emmanuel"
              ]
            }],
            "telecom": [{
              "system": "phone",
              "value": "0678 561608"
            }],
            "gender": "male",
            "birthDate": "1972-01-08"
          },
          "request": {
            "method": "PUT",
            "url": "Patient/3fe45cb4-1a1b-4e3b-a064-0a83df6164f2"
          }
        }, {
          "resource": {
            "resourceType": "Patient",
            "id": "bc58707b-62f1-498a-8fb3-568cd5b69db2",
            "meta": {
              "tag": [{
                "system": "http://openclientregistry.org/fhir/clientid",
                "code": "openmrs",
                "display": "OpenMRS"
              }]
            },
            "identifier": [{
                "system": "http://clientregistry.org/openmrs",
                "value": "patient2"
              },
              {
                "system": "http://health.go.ug/cr/nationalid",
                "value": "228374844"
              },
              {
                "system": "http://system1.org",
                "value": "12347",
                "period": {
                  "start": "2001-05-07"
                },
                "assigner": {
                  "display": "test Org"
                }
              }
            ],
            "active": true,
            "name": [{
              "use": "official",
              "family": "Joshua",
              "given": [
                "Emmanueli"
              ]
            }],
            "telecom": [{
              "system": "phone",
              "value": "0678 561608"
            }],
            "gender": "male",
            "birthDate": "1972-01-08"
          },
          "request": {
            "method": "PUT",
            "url": "Patient/bc58707b-62f1-498a-8fb3-568cd5b69db2"
          }
        }]
      }
      """
    When The POS sends multiple Patients
    Then The added Patient Location and CRID are returned
