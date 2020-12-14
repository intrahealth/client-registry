Feature: Retrieve Patient


Scenario: Get an existing patient
    Given Patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f exists on the server
      """
      d55e15fd-d7a6-42b8-89cc-560e3578ef7f
      """
    When A system requests patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f
    Then Patient d55e15fd-d7a6-42b8-89cc-560e3578ef7f is returned

