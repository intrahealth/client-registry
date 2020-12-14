Feature: UnBreaking Match


Scenario: UnBreaking a match
    Given Patient IDs
      """
      [{
        "id2": "Patient/c14361b1-481f-4cdb-87c7-018e0e107a55",
        "id1": "Patient/cfa54360-ab37-4ded-8309-4c136ca40e33"
      }]
      """
    When The POS sends Patient IDS
    Then The server responds with status code 201
