# Roadmap

The maintainers seek feedback from the broader health IT community involved in patient identity management to inform future directions for OpenCR. Please reach out on the OpenCR channel on the iHRIS Slack!

Priority areas for feedback are the following:

* **Simplify configuration for patient matching decision rules:** A longstanding request is to simplify configuration for patient matching decision rules. In 2022 this was addressed by removing the need to write a configuration for ElasticSearch for decision rules. Instead, fields required for indexing because they are in the decision rules are automatically included for indexing.

* **Support for HAPI FHIR Server MDM (Master Data Management) as an optional backend:** This feature would make it possible to use the OpenCR UI with the HAPI MDM backend. OpenCR utilizes ElasticSearch for the task of matching which is scalable and fast. After the initial release of OpenCR, SmileCDR released a patient identity matching mechanism and then overhauled it to allow matching any FHIR resources. There are proprietary features in the SmileCDR product that allow managing 'golden records', meaning to promote fields as authoritative. OpenCR has an open source UI which does not exist in the HAPI or SmileCDR products. 

* **Support Keycloak and similar:** This feature would allow for using authentication and authorization realms managed by Keycloak, a popular open source engine.