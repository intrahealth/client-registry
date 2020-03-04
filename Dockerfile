FROM node:dubnium

RUN mkdir -p /var/log
COPY . /src/
WORKDIR /src/server
RUN npm install

ARG NODE_ENV=docker

ENV node_env=$NODE_ENV

EXPOSE 3000
CMD ["node", "lib/app.js"]