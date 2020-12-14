Feature: Breaking Match


Scenario: Breaking a match
    Given Patient IDs
      """
      ["Patient/ba3d2c47-f0ec-4f62-8677-c45786e37b90"]
      """
    When The POS sends Patient IDS
    Then The server responds with status code 200
