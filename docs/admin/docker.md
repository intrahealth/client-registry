# Local Installation using Docker

!!! note "Time to complete"
    10 Minutes

!!! warning
    This guide is for demonstrations or tests only, not for servers or production environments.

The easiest way to get started with OpenCR is to use Docker to launch ElasticSearch and HAPI FHIR Server and run the OpenCR Service directly. By running the OpenCR Service directly, it is easy to revise and reload decision rules.

These instructions have been tested on Linux and macOS.

!!! note
    This installation method requires some familiarity with the command line.

## Prerequisites

- Any modern PC capable of running Docker for Desktop.
  - macOS: 2010 and newer Macs. macOS 10.13 or later (Sierra, Mojava, Catalina).
  - Windows 10 64-bit (Education, Pro, or Enterprise). Note that you must have Hyper-V and Containers Windows enabled and these require administrator privileges.
- 8GB RAM on the computer is recommended. ElasticSearch and HAPI FHIR Server will use up to 1GB of RAM. OpenCR Service will use less than 200MB RAM.
- Docker for Desktop
- [Node 10](https://nodejs.org/en/download/package-manager) which includes npm.
- [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

## Instructions

- Clone the repository and change directory into the root folder.

```sh
https://github.com/intrahealth/client-registry.git
cd client-registry
```

- Ensure that Docker is installed and running.

```sh
docker --version
```

### Docker HAPI-FHIR and ES with node OpenCR

Start ElasticSearch and HAPI FHIR Server using Docker.

!!! warning
    You cannot use the existing hosted ElasticSearch image because OpenCR requires two plugins to be installed. The docker-compose file provided uses the Dockerfile-es which builds an ES image with the plugins.

```sh
docker-compose up fhir es
```

- Then install the requirements for the OpenCR Service.

```sh
cd server
npm install
```

- Copy a configuration for Docker for the OpenCR Service to use.

```sh
cp config/config_docker_template.json config/config_docker.json
```

- Run the server using the docker config for NODE_ENV.

```sh
# from client-registry/server
sudo NODE_ENV=docker node lib/app.js
```

> `sudo` is needed as OpenCR requires access to /var/log for logging. This requirement may be changed in the future.

- Visit the UI at: [https://localhost:3000/crux](https://localhost:3000/crux)
  - **Default username**: root@intrahealth.org
  - **Default password**: intrahealth

### Docker-Compose FHIR, ES, and OpenCR

```sh
docker-compose -f docker-compose.cicd.yml up -d
```

> The flag `-d` runs the processes in the background.

- Visit the UI at: [https://localhost:3000/crux](https://localhost:3000/crux)
  - **Default username**: root@intrahealth.org
  - **Default password**: intrahealth

#### Change the OpenCR Config

If you want to add dockerised OpenCR to a system with different docker dependency names, you can add new config files with the following script changes.

In this scenario, we are going to change the HAPI-FHIR container name to `test-fhir`.

To start, open the `/server/config/config_cicd_template.json` file in a text editor and in the `"fhirServer":` config section make the following change:

```json
...
"fhirServer": {
  "baseURL": "http://test-fhir:8080/fhir",
  "username": "hapi",
  "password": "hapi"
},
...
```

With that config in place we need to volume in this new config file into our `docker-compose.cicd.yml` file. Open this file in a text editor. We need three changes, first change the **depends_on** value from *fhir* to `test-fhir`. Then, add a new environment variable `HAPI_FHIR_URL` with the value <http://test-fhir:8080/fhir/metadata>. This url will be used to check the HAPI FHIR instance is running. Finally, add the volumes config to opencr. Your `opencr` config section should resemble this:

```yml
  opencr:
    container_name: opencr
    image: intrahealth/opencr
    ports:
      - "3000:3000"
    depends_on:
      - test-fhir
      - es
    restart: always
    environment:
      - NODE_ENV=cicd
      - HAPI_FHIR_URL=http://test-fhir:8080/fhir/metadata
    volumes:
      - ./server/config/config_cicd_template.json:/src/server/config/config_cicd.json
```

Now we can start the system with the following:

```sh
docker-compose -f docker-compose.cicd.yml up -d
```

> The flag `-d` runs the processes in the background.

- Visit the UI at: [https://localhost:3000/crux](https://localhost:3000/crux)
  - **Default username**: root@intrahealth.org
  - **Default password**: intrahealth

### View status details of containers

To see the container statuses run the following command:

```sh
docker ps -a
```

> The flag `-a` will include containers that are not running (i.e. from errors or a manual container stop)

### View system logs

To see the logs of a component run the following command:

```sh
docker logs -f <component>
```

> Components are: `opencr`, `es`, and `fhir`

#### Spin down test instance

To remove remove OpenCR and its dependencies, run the following:

```sh
docker-compose -f docker-compose.cicd.yml down
```
