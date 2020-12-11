Feature: Breaking Match


Scenario: Breaking a match
    Given Patient IDs
      """
      ["Patient/6f017270-a089-4b23-a667-3f8508412ca0"]
      """
    When The POS sends Patient IDS
    Then The server responds with status code 200
