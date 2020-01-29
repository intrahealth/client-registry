# Client Registry

This is a lightweight mediator for [OpenHIM](http://openhim.org) that, in combination with a FHIR server, acts as a client registry.

> This is not an OpenHIE product. Rather, it is a prototypical client registry to facilitate discussion among a broad set of stakeholders. Please join the [OpenHIE Client Registry Community](https://discourse.ohie.org) calls and get involved!

# Installation

Clone the repository
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

Run the server
```
node lib/app.js
```
