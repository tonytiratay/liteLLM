FROM ghcr.io/berriai/litellm:main-stable

COPY config.yaml /app/config.yaml

COPY guardrails /app/guardrails
ENV PYTHONPATH="${PYTHONPATH}:/app/guardrails"

CMD ["--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
