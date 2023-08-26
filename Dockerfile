FROM node:16-slim

RUN mkdir -p /var/log
ARG branch=master
RUN apt-get -qq update && apt-get install -y -qq git && apt-get install -y --no-install-recommends wget
#RUN git clone --branch ${branch} https://github.com/intrahealth/client-registry /src/
COPY . /src/

WORKDIR /src/server
RUN npm install

RUN cp /src/server/config/config_docker_template.json /src/server/config/config_docker.json
RUN cp /src/server/config/config_cicd_template.json /src/server/config/config_cicd.json

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

ENV DOCKERIZE_VERSION v0.5.0
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz

EXPOSE 3000

ARG DEFAULT_HAPI_FHIR_URL=http://fhir:8080/fhir/metadata
ENV HAPI_FHIR_URL=$DEFAULT_HAPI_FHIR_URL

ENTRYPOINT dockerize -wait-retry-interval 5s -timeout 60s -wait $HAPI_FHIR_URL node lib/app.js
