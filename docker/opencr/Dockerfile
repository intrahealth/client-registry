FROM node:erbium-slim

RUN mkdir -p /var/log
ARG branch=master
RUN apt-get -qq update && apt-get install -y -qq git
RUN git clone --branch ${branch} https://github.com/intrahealth/client-registry /src/

WORKDIR /src/server
RUN npm install

RUN cp /src/server/config/config_docker_template.json /src/server/config/config_docker.json
RUN cp /src/server/config/config_cicd_template.json /src/server/config/config_cicd.json

ARG NODE_ENV=docker
ENV NODE_ENV=$NODE_ENV

EXPOSE 3000
CMD ["node", "lib/app.js"]