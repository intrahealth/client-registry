#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/elasticsearch:$(git rev-parse --short HEAD) .
docker tag intrahealth/elasticsearch:$(git rev-parse --short HEAD) intrahealth/elasticsearch
docker push intrahealth/elasticsearch:$(git rev-parse --short HEAD)
docker push intrahealth/elasticsearch:latest