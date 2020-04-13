# Server Installation

!!! caution
    Installing and maintaining a production installation is not trivial. This installation method requires strong familiarity with the command line and expertise administering Linux environments. 

The core production stack consists of four components:

* **OpenCR Service**: This includes primary API for fielding requests, and the record viewing and matching breaking UI. 
* **HAPI FHIR Server + Database**: HAPI FHIR Server is the reference implementation of FHIR in Java. It requries a database backend (e.g. Postgres or MySQL).
* **ElasticSearch**: Version >=7.5 supported and the analysis-phonetic plugin is required.

Optional components:

* **OpenHIM core and OpenHIM admin console**. Requires MongoDB. OpenHIM is an authentication, authorization, and auditing layer. While OpenHIM is optional, nodes and users must be managed in some application if not OpenHIM. Nodes must have certificates issued to query OpenCR and they must be rotated out over time. The OpenCR Service can manage simply installations but using an enterprise secrets management tool is recommended. 

## Prerequisites

Linux is the expected operating system for production.

It is critical that systems administrators note the version compatibilities outlined below. This guide does not cover most aspects of enterprise systems administration, rather it attempts to cover the OpenCR platform. If there are key areas missing, please open an [issue on GitHub](https://github.com/intrahealth/client-registry/issues/new).

* If entities outside of your LAN are connecting to OpenCR, you will need a public-facing domain name. A domain is necessary for a certificate which is required for any queries.
* See [Security](security.md)

## HAPI FHIR Server and Postgres

HAPI FHIR must use a database backend in production. HAPI FHIR stores the patient demographic data from queries. If the data is lost, then OpenCR data is unrecoverable.

* Follow the [JPA Server information](https://hapifhir.io/hapi-fhir/docs/server_jpa/get_started.html) and [instructions](https://github.com/hapifhir/hapi-fhir-jpaserver-starter) for how to customize the hapi.properties file and build the server using maven.
* The ES integration is separate from HAPI FHIR Server, so there is not need to use it as an indexer. ES only works with an old version of ES.
* Install and configure the preferred database. Postgres has been tested by the maintainers but any database should work that HAPI supports. Change default passwords on the database.
* Database replication should be encrypted.
* Confirm that HAPI accepts requests. 
* The web interface for HAPI should be disabled for privacy reasons.

!!! caution
    In production, Postgres should run on multiple nodes with replication. This is to ensure high availability and backups of the data.


## ElasticSearch

* Follow the instructions for [installation](https://www.elastic.co/guide/en/elasticsearch/reference/current/deb.html)
* Systemd is the preferred system and service manager. There are commands to initiate systemd and journalctl.
* The phonetic analysis package must be installed.

```
/usr/share/elasticsearch/bin/elasticsearch-plugin install analysis-phonetic
```

!!! caution
    ES is not production-ready when run one a single node. It is recommended to run ES on several nodes. Those nodes can also run followers of Postgres.

## OpenCR Service and UI

Clone the repository into a directory of choice.
```
git clone https://github.com/intrahealth/client-registry.git
```

Enter the server directory, install node packages.
```
cd client-registry/server
npm install
```

Copy and edit the configuration file to your liking.
```
cp config/config_development_template.json config/config_development.json
# edit the servers...
```

The minimum changes to start a running standalone system are:

* Change `fhirServer.baseURL` to "http://localhost:8080/baseR4/"

Run the server from inside client-registry/server:
```
node lib/app.js
```

## OpenHIM (Optional)

OpenHIM supports the last 2 versions of NodeJS LTS and requires MongoDB.

* Follow the [instructions](http://openhim.org/docs/installation/npm) to install OpenHIM core and admin console. The maintainers use the NPM PPA installation method.
* Note the important step to obtain a certificate immediately after installation. The configuration should be that any client must have a certificate and the server has a certificate (mutual TLS).
* Follow the instructions including console configuration. 
* Note the important step to change the console password. It is also recommended that the console only be accessible on a local subnet and not to the WAN.
* The config mediator.register must be set to true for the OpenCR Service to use OpenHIM.