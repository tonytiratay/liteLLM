FROM ghcr.io/berriai/litellm:v1.79.3-stable

COPY config.yaml /app/config.yaml

CMD ["--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
