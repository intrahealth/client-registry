# Security

!!! warning
    It is difficult (and irresponsible) to try to explain all of the best practices in computer security. This page focuses on how security is addressed in the Open Client Registry. The information may be incomplete. Where there is more clarity or information needed, please provide feedback in an [issue on GitHub](https://github.com/intrahealth/client-registry/issues/new) so that it can be added.


This page addresses several security areas, including hardening, user authentication, node authentication, auditing, and non-production (demos, tests) configurations.

For links to information on server resource planning see the [requirements](requirements.md) page.

## Hardening

!!! warning
    Server and network hardening and production best practices are out of scope. This document only attempts to capture aspects relevant to the Client Registry.

### General Server, Network, and Service Hardening

Hardening and production best practices include:

* Removing unnecessary services, software, network protocols
* Backup and recovery
* Patches
* Vulnerability scanning
* Limiting remote administration
* Managing open internal and external ports
* Auditing, logging software

See, for example, the [Guide to General Server Security: Recommendations of the National Institute of Standards and Technology](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-123.pdf) by Karen Scarfone, Wayne Jansen, Miles Tracy, July 2008, (NIST Special Publication 800-123).

### OpenCR Platform Hardening

In addition to the above general hardening practices that should be followed, some additional areas are important for the Client Registry.

* The **OpenCR UI** should only be available on a local subnet, and further restricted with user and node authentication so that it is not exposed on the WAN.
* **Close external ports**: Ports for Client Registry services should be locked down to localhost. The only external port required is for TLS with point-of-service systems that make queries to the Client Registry Service. This includes ES and HAPI FHIR. Those services can serve localhost only and effectively. 
* **TLS for cluster (interservice) communication**: Where Postgres and ES must communicate with other nodes TLS can be configured for ES for internode communication and Postgres for replication.
* **Disable HAPI Web Testing**: The HAPI FHIR Server Web Testing UI should be disabled. This tool allows the viewing of demographic records on the server. It is not a tool suitable for production, or if it is used, then it is restricted to a local subnet and further restricted with user and node authentication.
* **Double-check for default passwords**: Ensure no default passwords are in use for OpenHIM core and console, HAPI FHIR Server, ES, Postgres, and other services.

## Authentication, Authorization, and Auditing

### User Authentication

* Point-of-service systems should possess an appropriate identity provider solution built-in or externally. This also means following best practices for user authentication. 
* The Client Registry Service and admin interface are the only direct access to demographic data systems that should require user authentication. As this Client Registry is meant for further customization during deployment, JWT and other user authentication solutions are not provided out-of-the-box but can be added.
* It is intended to support user-requested user authentication solutions as use cases are further identified.

### Node Authentication

* OpenCR follows best practices outlined in the [ITI-19 standard](https://www.ihe.net/uploadedFiles/Documents/ITI/IHE_ITI_TF_Vol2a.pdf) for node authentication. 
* Only secure nodes -- one with the ability to authenticate itself to other nodes and transmit data securely -- should be allowed to communicate with the Client Registry.
* Systems administrators should ensure that all clients must be registered and certificates assigned to them. In production, OpenCR may act as an OpenHIM mediator which provides an extra layer of security. Clients may be registered in OpenHIM.

### Audit Events

* All transactions (including queries) are stored in audit events. These events are stored in the HAPI FHIR Server and viewable in the OpenCR UI. 
* Being able to view audit events helps administrators run the system and tune queries,
* But, audit events must also be secured as they contain all information about queries. This means locking down the OpenCR by subnet, node, and user authentication.

## ATNA Logging

OpenHIM supports the Audit Trail and Node Authentication (ATNA) Integration Profile, which establishes a standard for responsibly storing audit events. It is highly recommended that the OpenHIM be configured as such but only after it is ensured that all default passwords have been changed and the OpenHIM is operating on a local subnet and thus not exposed externally. See the above hardening notes.

See the [OpenHIM user guide](https://openhim.readthedocs.io/en/latest/user-guide/auditing.html) for information on ATNA configuration.

## Non-Production

In non-production settings only may self-signed certificates be created for testing and demonstrations. An example is as follows:
```sh
openssl req -newkey rsa:4096 -keyout dhis2_key.pem -out dhis2_csr.pem -nodes -days 365 -subj "/CN=dhis2"
openssl x509 -req -in dhis2_csr.pem -CA ../certificates/server_cert.pem -CAkey ../certificates/server_key.pem -out dhis2_cert.pem -set_serial 01 -days 36500
openssl pkcs12 -export -in dhis2_cert.pem -inkey dhis2_key.pem -out dhis2.p12
```

