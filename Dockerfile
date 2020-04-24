FROM node:erbium

RUN mkdir -p /var/log
COPY . /src/
WORKDIR /src/server
RUN npm install

RUN cp /src/server/config/config_docker_template.json /src/server/config/config_docker.json

ARG NODE_ENV=docker

ENV node_env=$NODE_ENV

EXPOSE 3000
CMD ["node", "lib/app.js"]