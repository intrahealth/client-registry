# Local Installation

!!! note "Time to complete"
    60 Minutes

!!! warning
    This guide is for demonstrations or tests only, not for production environments.

!!! note
    This installation method requires familiarity with the command line.

## Prerequisites

* CPU/RAM: Modern CPUs with 8GB RAM.
* Java version 8 (1.8). Oracle-licensed Java (requires sign-in) and [AdoptOpenJDK](https://adoptopenjdk.net) (not sign-in required) have been tested.
* [Node 10](https://nodejs.org/en/download/package-manager) which includes npm.
* [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

## HAPI FHIR Server CLI

For non-production environments, the HAPI maintainers provide a simple CLI-based tool to run it.

The only required dependency is Java >= 8 (1.8).

See [HAPI FHIR CLI](https://smilecdr.com/hapi-fhir/docs/tools/hapi_fhir_cli.html) for instructions for the OS of choice.

The Client Registry requires FHIR version R4 and HAPI must be started for this version. To run HAPI:
```
hapi-fhir-cli run-server -v r4
```

The HAPI Web Testing UI is available at [http://localhost:8080/](http://localhost:8080/) The Web Testing UI should be disabled for production. It allows the viewing of any resource on the server.

The FHIR Base URL is at [http://localhost:8080/baseR4/](http://localhost:8080/baseR4/)

Visit [http://localhost:8080/](http://localhost:8080/) to ensure HAPI is up and running or
```sh
curl -X GET "localhost:8080/baseR4/Patient?"
```

## ElasticSearch

Install and start ES for the intended OS. See the [ES install instructions](https://www.elastic.co/guide/en/elasticsearch/reference/current/install-elasticsearch.html)

The required version is >=7.5.

The phonetic analysis package must be installed. For example:
```
/usr/share/elasticsearch/bin/elasticsearch-plugin install analysis-phonetic
```

Once installed and started, ensure that ES is up and running:
```sh
curl -X GET "localhost:9200/_cat/health?v&pretty"
```
Status should be yellow for a single-node cluster.


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
# from client-registry/server
sudo NODE_ENV=development node lib/app.js
```

* Visit the UI at: [https://localhost:3000/crux](https://localhost:3000/crux)
    * **Default username**: root@intrahealth.org 
    * **Default password**: intrahealth

OpenCR may require access to /var/log for logging. This requirement may be changed in the future.

Congratulations! Now it's time to run a [query](queries.md).
