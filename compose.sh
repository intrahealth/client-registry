composeFilePath=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )

if [ "$1" == "init" ]; then
    docker-compose -f "$composeFilePath"/docker-compose.yml up -d fhir es

    # Set up the openhim
    # "$composeFilePath"/initiateReplicaSet.sh

    # Wait
    sleep 100
    docker-compose -f "$composeFilePath"/docker-compose.yml up -d opencr


elif [ "$1" == "up" ]; then
    docker-compose -f "$composeFilePath"/docker-compose.yml up -d fhir es

    # Wait
    sleep 20
    docker-compose -f "$composeFilePath"/docker-compose.yml up -d opencr

elif [ "$1" == "down" ]; then
    docker-compose -f "$composeFilePath"/docker-compose.yml stop

elif [ "$1" == "destroy" ]; then
    docker-compose -f "$composeFilePath"/docker-compose.yml down -v

else
    echo "Valid options are: init, up, down, or destroy"
fi