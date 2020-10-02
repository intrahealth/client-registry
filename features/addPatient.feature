Feature: Submit Patient


Scenario: Add a new Patient
    Given A new Patient
      """
      {
        "resourceType": "Patient",
        "name": [
          {
            "family": "Tester",
            "given": "Test"
          }
        ],
        "birthDate": "1990-01-01"
      }
      """
    When The POS sends the Patient
    Then The added Patient Location and CRID are returned
