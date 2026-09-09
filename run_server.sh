#!/bin/bash
docker run --rm -it -p 8000:8000 -v "$(pwd)":/srv/http --workdir /srv/http python:3-alpine python -m http.server 8000 --bind 0.0.0.0
