Feature: Add Invalid Patient


Scenario: Add invalid patient
    Given Patient data
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
    Then The server responds with status code 400