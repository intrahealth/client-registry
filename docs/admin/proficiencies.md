# Proficiencies

## Linux Systems Administration

OpenCR is not one application, it's several and is expected to be run on Linux. Persons installing and managing OpenCR require advanced expertise with Linux. Here are the major topics where knowledge is required:

* **Linux users and groups**: This includes understanding and restricting `sudo` access.
* **Networking**: Limiting the public and LAN exposure of services. For instance, HAPI FHIR Server and ElasticSearch should only be exposed to localhost while the UI may be exposed to a LAN subnet, if at all.
* **Databases**: HAPI FHIR Server requires a database backend. For demos, it can be used with an existing temporary datastore, Derby, but this is not appropriate for maintaining data in production. In production, databases should be backed up and those backups tested as suitable artifacts for recovery. 
* **Process management**: [systemd and the systemctl](https://www.linode.com/docs/quick-answers/linux-essentials/introduction-to-systemctl/) series of commands are recommended for managing the process lifecycle, including restarting services and logging their status. 
* **Logging**: Suitable logging practice requires safely logging the minimum data required to understand performance and uptime.
* **Auditing**: The OpenCR software stack should be regularly audited. The security section discusses the range of issues to address.

## Software

For installing and managing an existing OpenCR installation, there are a handful of commands that can be learned.

* **Java**: HAPI FHIR Server and ElasticSearch are written in Java. Java applications are generally built with frameworks for common design patterns and often built using Gradle or Maven.

* **JavaScript and Node**: The OpenCR Service is written in Node, a popular JavaScript framework for building RESTful applications. Node applications are packaged around the Node Package Manager.

* **Postgres/MySQL**: Either Postgres or MySQL are recommended to be used with HAPI FHIR Server. Administrators should become familiar with backup and recovery procedures.
