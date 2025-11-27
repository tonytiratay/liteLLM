# LiteLLM Proxy Setup

This repository contains a configured LiteLLM Proxy setup for both Development and Production environments.

## Prerequisites

- Docker
- Docker Compose

## Setup

1.  Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Fill in your API keys in `.env`.

## Development

To run the proxy in development mode (with hot-reloading config if mounted, though Dockerfile copies it):

```bash
docker-compose up --build
```

Access the proxy at `http://localhost:4000`.

## Production

To run the proxy in production mode (restart policies, persistent volumes):

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

## Configuration

Edit `config.yaml` to add or modify models.

## Testing

Check health:
```bash
curl http://localhost:4000/health
```

Test chat completion:
```bash
curl -X POST 'http://localhost:4000/chat/completions' \
-H 'Authorization: Bearer sk-1234' \
-H 'Content-Type: application/json' \
-d '{
    "model": "gpt-3.5-turbo",
    "messages": [
        { "role": "user", "content": "Hello!" }
    ]
}'
```
