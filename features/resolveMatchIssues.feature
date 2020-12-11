Feature: Resolving Match Issues


Scenario: Resolving match issue
    Given Resolve details
      """
      {
        "resolvingFrom": "6f017270-a089-4b23-a667-3f8508412ca0",
        "resolves": [{
          "id": "6f017270-a089-4b23-a667-3f8508412ca0",
          "gender": "male",
          "given": "Emanueel",
          "family": "Joshua",
          "birthDate": "1972-01-08",
          "phone": "0678 561608",
          "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "source_id": "patient4",
          "source": "OpenMRS",
          "scores": {
            "patient2": 3,
            "patient1": 3,
            "patient5": 2
          },
          "patient2": 3,
          "patient1": 3,
          "patient5": 2
        }, {
          "id": "d55e15fd-d7a6-42b8-89cc-560e3578ef7f",
          "gender": "male",
          "given": "Emanuel",
          "family": "Joshua",
          "birthDate": "1972-01-08",
          "phone": "0678 561608",
          "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "source_id": "patient2",
          "source": "OpenMRS",
          "scores": {
            "patient4": 3,
            "patient1": 3,
            "patient5": 2
          },
          "patient4": 3,
          "patient1": 3,
          "patient5": 2
        }, {
          "id": "3fe45cb4-1a1b-4e3b-a064-0a83df6164f2",
          "gender": "male",
          "given": "Emmanuel",
          "family": "Joshua",
          "birthDate": "1972-01-08",
          "phone": "0678 561608",
          "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "ouid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "source_id": "patient1",
          "source": "OpenMRS",
          "scores": {
            "patient4": 3,
            "patient2": 3,
            "patient5": 2
          },
          "patient4": 3,
          "patient2": 3,
          "patient5": 2
        }, {
          "id": "433ebeb6-1d89-4b64-97e6-a985675ca571",
          "gender": "male",
          "given": "Emanuel",
          "family": "Joshua",
          "birthDate": "1972-01-08",
          "phone": "0678 56160",
          "uid": "9dd75a6a-2408-43d0-a577-d38292f4a73f",
          "ouid": "fe697ff3-62c5-4aa3-8747-ccb15a2ee9c3",
          "source_id": "patient5",
          "source": "OpenMRS",
          "scores": {
            "patient4": 2,
            "patient1": 2,
            "patient2": 2
          },
          "patient4": 2,
          "patient1": 2,
          "patient2": 2
        }],
        "removeFlag": false,
        "flagType": "potentialMatches"
      }
      """
    When The POS sends resolve details
    Then The server responds with status code 200
