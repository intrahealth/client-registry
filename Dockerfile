FROM node:dubnium

RUN mkdir -p /var/log
COPY . /src/
WORKDIR /src/server
RUN /bin/bash -c 'cp config/config_development_template.json config_development.json'
RUN npm install

EXPOSE 3000
CMD ["node", "lib/app.js"]