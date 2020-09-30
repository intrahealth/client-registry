Feature: Retrieve Patient


Scenario: Get an existing patient
    Given Patient 123 exists on the server
      """
      {
        "resourceType": "Patient",
        "id": "123",
        "name": [
          {
            "family": "Tester",
            "given": "Test"
          }
        ],
        "birthDate": "1990-01-01",
        "next": false
      }
      """    
    When A system requests patient 123
    Then Patient 123 is returned

