# User Interface (CRUX)

The OpenCR User Interface (CRUX) is a key way to monitor the operation of OpenCR. With CRUX, you can:

* View matches, break matches, revert broken matches
* Verifying FHIR messages are being processed correctly from submitting systems
* Validating matching is working as expected
* Perform deep inspection before putting it into production

!!! caution
    You may have access to the CRUX of a system, and that's a good thing. The CRUX allows users to be able to view any break any match, which includes viewing demographic data from submitting systems. It should be secure and only authorized users would be able to access it.

## Login 

User must be added to the CRUX to be able to login.

![](../images/cruxlogin.png)

## Landing Page

On landing inside CRUX, it display the records submitted in a row. These are individual records for POS that submit them. 

![](../images/cruxsplash.png)

It is easy to search for records on fields. In the below example, there are two records submitted that share the same CRUID. 

![](../images/cruxdupes.png)

## Record

The record page has a great deal of information, including:

* On the top right: All of the fields stored in the system
* On the top left: Matched records to the current one being viewed.
* Middle of the page: Broken matches, if they exist for the record.
* Bottom of the page: A history of all events affected the record, including creation, modification, and the decision rules used to make the matches.

![](../images/cruxrecord.png)


## Matched Records and Break Match

Matched records are listed in a compact table with links to other record. 

There is also an option to break one or all matches. 

![](../images/cruxbreakmatch.png)

### Break and Revert Matches

A match can be broken. When a match is broken, the patient record is no longer linked to it, therefore its CRUID changes. 

Once a match is broken, it may be reverted, meaning that the match can be reinstated.

![](../images/cruxrevertmatch.png)

## History

The history card shows the set of decision rules and overall submission information about each history event. All events include any decision rules that were used to make those matches and the specific ElasticSearch query.

![](../images/cruxhistoryoverall.png)


### Submission

The submission information includes when the event occurred, the status, and the IP address of the submitting system. (The address 127.0.0.1 in the example means within the same computer, not from the network, and is for example purposes only.)

![](../images/cruxhistoryipaddr.png)

### Decision Rules

Decision rules include the overall rule to evaluate the chain of decision rules, which is either probabilistic or deterministic. Then the card shows each decision rule and its configuration. This card helps understand how a decision was made and is critical for evaluation purposes.

![](../images/cruxhistorydecisionrules.png)
