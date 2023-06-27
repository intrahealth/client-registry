# Roadmap

The maintainers seek feedback from the broader health IT community involved in patient identity management to inform future directions for OpenCR. Please reach out on the OpenCR channel on the iHRIS Slack!

Priority areas for feedback are the following:

* **Simplify configuration for patient matching decision rules:** A longstanding request is to simplify configuration for patient matching decision rules. In 2022 this was addressed by removing the need to write a configuration for ElasticSearch for decision rules. Instead, fields required for indexing because they are in the decision rules are automatically included for indexing.

* **Support for HAPI FHIR Server MDM (Master Data Management) as an optional deduplication service:** This feature would make it possible to use OpenCR with the HAPI MDM and allow implementers to either choose elasticsearch/opensearch or HAPI MDM for deduplication. OpenCR utilizes ElasticSearch/OpenSearch for the task of matching which is scalable and fast. After the initial release of OpenCR, SmileCDR released a patient identity matching mechanism and then overhauled it to allow matching any FHIR resources. There are proprietary features in the SmileCDR product that allow managing 'golden records', meaning to promote fields as authoritative. OpenCR has an open source UI which does not exist in the HAPI or SmileCDR products.

* **Support Keycloak and similar:** This feature would allow for using authentication and authorization realms managed by Keycloak, a popular open source engine. The point in here is to enhance authentication in opencr which currently it only do basic authentication

* **Support for deduplication without submitting a patient:** Currently opencr runs the deduplication service every time a new patient is submitted or an existing patient is updated. This feature will allow openCR to be run without waiting for patient submission, especially when decision rules are changed.
