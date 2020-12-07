Feature: Submit Patient


Scenario: Add a new Patient
    Given A new Patient
      """
      {
        "resourceType": "Patient",
        "id": "433ebeb6-1d89-4b64-97e6-a985675ca572",
        "identifier": [
          {
            "system": "http://clientregistry.org/openmrs",
            "value": "patient3"
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
        "name": [
          {
            "use": "official",
            "family": "Joshua",
            "given": [
              "Emanuel"
            ]
          }
        ],
        "telecom": [
          {
            "system": "phone",
            "value": "0678 561608"
          }
        ],
        "gender": "male",
        "birthDate": "1972-01-08"
      }
      """
    When The POS sends the Patient
    Then The added Patient Location and CRID are returned
