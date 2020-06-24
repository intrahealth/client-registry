#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/opencr:$(git rev-parse --short HEAD) .
docker tag intrahealth/opencr:$(git rev-parse --short HEAD) intrahealth/opencr
docker push intrahealth/opencr:$(git rev-parse --short HEAD)
docker push intrahealth/opencr:latest