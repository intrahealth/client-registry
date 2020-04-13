# Roles and Responsibilities

## Responsibilities

There are a great deal of responsibilities that must be addresses for a successful implementation beyond the OpenHIE Implementation Guide.

* **Which systems will connect to the CR and how will support for querying the CR be implemented on the POS side?** There is emerging FHIR support for POS systems but features will need to be added to submit and process the queries. The Developer Guide includes a link to a reference implementation for OpenMRS MPI Client.
* **Which form fields of demographic data will be submitted?** Every use case and every form is different. There may be many different sets of demographic data that are stored, and this affects how matching is done.
* **Which algorithms and decision rules make sense for the use case?** There is a scientific literature on which algorithms perform efficiently for matching. There is a need to test algorithms -- which can be done outside of the CR such as in R and Python -- and the need to evaluate against what the CR implementation is doing to ensure consistency.
* **How will the matching algorithms be implemented, deployed, and backed-out for incorrect matches?** The CR includes an Admin UI for matching. The UI is meant to be highly restricted; it makes available demographic records. 
* **Who is responsible for providing preprocessed data to the CR?** The CR accepts formatted FHIR messages. It does not impose its own algorithms for cleaning. Connecting POS systems must provide data in the correct format and preprocess the data before sending. Updates can be made to incorrect demographic data later and those will be added to existing records.
* **How will systems launch and scaling up be managed?** What network and compute resources are available for deployment. Advanced Linux systems administration skills are required to launch and maintain the CR in production.

## Roles

In actual practice, there are specific roles.

* **Point-of-service systems users**: POS systems use the Client Registry to obtain a CRUID. This process is mostly invisible. Users of EMRs and other systems submitting queries may only see that there is a CRUID for a patient. The Client Registry is invisible to them.
* **POS developers**: Client Registry integration must be added into POS systems for them to be able to query for a CRUID. Software developers of POS systems should review the Developer Manual and understand how to implement the proper FHIR query for obtaining a CRUID.
* **Matching administrators** There may be situations in which the Client Registry implementation uses the UI for viewing and breaking matches. This is a privileged role that should be restricted to few individuals.
* **Client Registry systems administrator**: People managing the network, servers, backups and other aspects of the Client Registry. They should be very familiar with the Developer Guide, particularly security of the system, how to perform upgrades, and recovery procedures
* **Management team**: Governance of the system should be handled by a management team familiar with the implications of decisions, strategy, roll-out, and other aspects.