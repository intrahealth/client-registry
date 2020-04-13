# Decision Rules

## Overview

Demographic data from submitting systems is stored in HAPI FHIR. It is also recommended that the demographic data that is primarily stored in HAPI FHIR be indexed into Elasticsearch.

For match processing, there are two options. One is run in mediator-only mode, which is highly flexible and supports a handful of algorithms that can be chained together. Additional algorithms can be added as needed. 

The second is to use ES. ES is very fast and supports compound queries but currently only supports Levenshtein distance.  When using ES, every request to the FHIR Server is cached in ES.

(One additional caveat for Levenshtein distance is that the mediator-only matching can support edit distances exceeding two, while ES edit distance cannot exceed two.)

Every client wishing to use the Client Registry must be authenticated and authorized. See the configuration page for more information. 

## How to Set Decision Rules

Decision rules determine how matches are made among records, for example, by using a certain algorithm on one field and a different algorithm on another. 

Let's use the below example:

`rules.givenName` is used as one rule on the field givenName.

`rules.givenName.algorithm` defines an algorithm, in this instance Jaro-Winkler, and an threshold for that algorithm unique to it.

`rules.givenName.path` is a required FHIRpath for the fields, a standard way to define how to traverse a FHIR resource. In future, a GUI may be used for defining the FHIRpath.

By default, all of the rules are chained together in a logical AND statement. In ES the search queries are assembled into compound queries.


[Link to file](https://github.com/openhie/client-registry/blob/master/server/config/decision_rules.json)

Contents of `server/config/decision_rules.json`
```json
{
  "__comments": {
    "path": "Its a fhir path, for syntax refer to https://www.hl7.org/fhir/fhirpath.html",
    "type": "String, Date, Number or Boolean",
    "threshold": {
      "levenshtein": "Lower the number, the closer the match, 0 being exact match",
      "jaro-winkler": "number between 0 and 1, where 0 for no match and 1 for exact match"
    }
  },
  "rules": {
    "givenName": {
      "algorithm": "jaro-winkler",
      "threshold": 0.89,
      "path": "name.where(use='official').last().given",
      "type": "string",
      "systems": ["system1", "system2", "system3"]
    },
    "familyName": {
      "algorithm": "damerau-levenshtein",
      "threshold": 3,
      "path": "name.where(use='official').last().family",
      "type": "String"
    },
    "gender": {
      "algorithm": "exact",
      "path": "gender",
      "type": "String"
    }
  }
}
```
