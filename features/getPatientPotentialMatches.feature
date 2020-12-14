Feature: Get Patient Potential Matches


Scenario: Get patient match
    Given Patient ID
      """
      04cdafc2-cc7b-435e-bd5b-0ee12a2367b7
      """
    When The POS sends patient ID
    Then Potential matches are returned
