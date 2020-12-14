Feature: Submit Single Patient


Scenario: Add a new single Patient
    Given A new single Patient
      """
      {
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
            "Emanueel"
          ]
        }],
        "telecom": [{
          "system": "phone",
          "value": "0678 561608"
        }],
        "gender": "male",
        "birthDate": "1972-01-08"
      }
      """
    When The POS sends the Patient
    Then The added Patient Location and CRID are returned
