#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/opencr-ux:$(git rev-parse --short HEAD) .
docker tag intrahealth/opencr-ux:$(git rev-parse --short HEAD) intrahealth/opencr-ux
docker push intrahealth/opencr-ux:$(git rev-parse --short HEAD)
docker push intrahealth/opencr-ux:latest