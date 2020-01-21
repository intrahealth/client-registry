#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t openhie/client-registry:$(git rev-parse --short HEAD) .
docker tag openhie/client-registry:$(git rev-parse --short HEAD) openhie/client-registry
docker push openhie/client-registry:$(git rev-parse --short HEAD)
docker push openhie/client-registry:latest