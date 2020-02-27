#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/opencr-service:$(git rev-parse --short HEAD) .
docker tag intrahealth/opencr-service:$(git rev-parse --short HEAD) intrahealth/opencr-service
docker push intrahealth/opencr-service:$(git rev-parse --short HEAD)
docker push intrahealth/opencr-service:latest