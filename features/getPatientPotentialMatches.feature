Feature: Get Patient Potential Matches


Scenario: Get patient match
    Given Patient ID
      """
      433ebeb6-1d89-4b64-97e6-a985675ca571
      """
    When The POS sends patient ID
    Then Potential matches are returned
