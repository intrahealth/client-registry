Feature: UnBreaking Match


Scenario: UnBreaking a match
    Given Patient IDs
      """
      [{
        "id2": "Patient/6f017270-a089-4b23-a667-3f8508412ca0",
        "id1": "Patient/bc58707b-62f1-498a-8fb3-568cd5b69db2"
      }, {
        "id2": "Patient/6f017270-a089-4b23-a667-3f8508412ca0",
        "id1": "Patient/d55e15fd-d7a6-42b8-89cc-560e3578ef7f"
      }]
      """
    When The POS sends Patient IDS
    Then The server responds with status code 201
