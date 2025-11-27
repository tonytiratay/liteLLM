FROM ghcr.io/berriai/litellm:main-latest

# Development specific settings can go here
# For now, it's just a wrapper around the base image to allow for future dev-specific tools
CMD ["--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
