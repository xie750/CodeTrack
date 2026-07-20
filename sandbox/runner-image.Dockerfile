FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ coreutils \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 sandbox

USER sandbox
WORKDIR /workspace

