#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --platform="linux/amd64" --no-cache -t jabahum/nchr-ui-api:$(git rev-parse --short HEAD) .
docker tag jabahum/nchr-ui-api:$(git rev-parse --short HEAD) jabahum/nchr-ui-api
docker push jabahum/nchr-ui-api:$(git rev-parse --short HEAD)
docker push jabahum/nchr-ui-api:latest