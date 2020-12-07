Feature: Retrieve Patient


Scenario: Get an existing patient
    Given Patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e exists on the server
      """
      {
        "resourceType": "Patient",
        "id": "76e82de7-26d5-4aa8-9e1c-b549a4184b7e",
        "meta": {
          "versionId": "2",
          "lastUpdated": "2020-10-20T19:29:50.653+03:00",
          "source": "#im8dM78mO3fZdeGp",
          "tag": [
            {
              "system": "http://openclientregistry.org/fhir/clientid",
              "code": "openmrs",
              "display": "OpenMRS"
            }
          ]
        },
        "text": {
          "status": "generated",
          "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><div class=\"hapiHeaderText\">zuwena <b>LUSIKE </b></div><table class=\"hapiPropertyTable\"><tbody><tr><td>Identifier</td><td>rec-2009-org</td></tr><tr><td>Date of birth</td><td><span>28 October 1976</span></td></tr></tbody></table></div>"
        },
        "identifier": [
          {
            "system": "http://clientregistry.org/openmrs",
            "value": "rec-2009-org"
          },
          {
            "system": "http://clientregistry.org/nationalid",
            "value": "CF68167355NUZY"
          },
          {
            "system": "http://clientregistry.org/artnumber",
            "value": "KUB-176148"
          }
        ],
        "name": [
          {
            "use": "official",
            "family": "lusike",
            "given": [
              "zuwena"
            ]
          }
        ],
        "telecom": [
          {
            "system": "phone",
            "value": "772 614594"
          }
        ],
        "gender": "female",
        "birthDate": "1976-10-28",
        "link": [
          {
            "other": {
              "reference": "Patient/73d17735-4835-474b-bebb-4f1d23c5e6d5"
            },
            "type": "refer"
          }
        ]
      }
      """
    When A system requests patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e
    Then Patient 76e82de7-26d5-4aa8-9e1c-b549a4184b7e is returned

