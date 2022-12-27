#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/opensearch:$(git rev-parse --short HEAD) .
docker tag intrahealth/opensearch:$(git rev-parse --short HEAD) intrahealth/opensearch
docker push intrahealth/opensearch:$(git rev-parse --short HEAD)
docker push intrahealth/opensearch:latest