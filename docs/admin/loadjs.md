# Load Demo Data (JavaScript)

Demonstration data is provided in the /tests directory in the [code repository](https://github.com/intrahealth/client-registry). 

## Install the Node Packages

```
cd tests
npm install
```

## Configure the Script

The /tests/uploadCSV.js script is used to upload the CSV data in the /tests directory.

If using OpenHIM, then change the auth options and the IP address/hostname in /tests/uploadCSV

```
# make a copy to modify
cp uploadCSV.js uploadCSV_mychanges.js
```

The defaults are:
```js
const options = {
url: 'http://localhost:5001/Patient',
auth,
json: entry.resource,
};
```

Edit uploadCSV_mychanges.js. If not running OpenHIM then change:
* remove `auth` and change it to `agentOptions`
* Change the IP address/hostname as required, for example for Docker: 'https://localhost:3000/Patient'.

After the edits, the code block looks like this:
```js
const options = {
url: 'https://localhost:3000/Patient',
agentOptions,
json: entry.resource,
};
```

Notice the https as without OpenHIM the OpenCR Service encrypts the connections using TLS instead of OpenHIM doing so.

## Running the Script

While in the /tests directory, ensure that OpenCR is running and run the script, with the required argument of the CSV:

```bash
sudo node uploadCSV_mychanges.js uganda_data_v21_20201501.csv
```

!!! caution
    The script may take several hours to process all of the records.

