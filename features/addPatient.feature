Feature: Submit Patient


Scenario: Add a new Patient
    Given A new Patient
      """
      {
        "resource": {
          "resourceType": "Patient",
          "id": "6f017270-a089-4b23-a667-3f8508412ca0",
          "meta": {
            "tag": [{
              "system": "http://openclientregistry.org/fhir/clientid",
              "code": "openmrs",
              "display": "OpenMRS"
            }]
          },
          "identifier": [{
              "system": "http://clientregistry.org/openmrs",
              "value": "patient4"
            },
            {
              "system": "http://health.go.ug/cr/nationalid",
              "value": "228374855"
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
              "Emanueel"
            ]
          }],
          "telecom": [{
            "system": "phone",
            "value": "0678 561608"
          }],
          "gender": "male",
          "birthDate": "1972-01-08",
          "link": [{
            "other": {
              "reference": "Patient/9dd75a6a-2408-43d0-a577-d38292f4a73f"
            },
            "type": "refer"
          }]
        },
        "request": {
          "method": "PUT",
          "url": "Patient/6f017270-a089-4b23-a667-3f8508412ca0"
        }
      }
      """
    When The POS sends the Patient
    Then The added Patient Location and CRID are returned
