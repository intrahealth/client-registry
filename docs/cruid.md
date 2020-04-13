# Unique Identifiers

OpenCR creates unique idenfiers (CRUIDs) which provide the key for record linkage.

## Example

In this example, there are three records for one person, Luke, and a CRUID has been assigned.

* Luke has records one EMR, another EMR, and a lab system.
* Each of his records has some demographic data.
* OpenCR has also created a CRUID - "CRUID-1", for Luke.
* There is a record for CRUID-1. It does not have demographic data, but it does have links to all of Luke's records.
* Once CRUID-1 has been assigned to Luke's records, his CRUID-1 is also linked to the original records.

![CRUID](images/cruid.png)