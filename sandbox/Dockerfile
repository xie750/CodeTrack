FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ ca-certificates docker.io \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 sandbox

WORKDIR /app

COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic

COPY sandbox /app/sandbox

CMD ["uvicorn", "sandbox.app:app", "--host", "0.0.0.0", "--port", "8011"]
