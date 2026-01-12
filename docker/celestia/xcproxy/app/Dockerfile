# Base image: a small Python 3.11 Linux distribution
FROM python:3.11-slim

# These envs make Python behave nicely in containers:
# - no .pyc files, and unbuffered stdout/stderr (logs show up immediately)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install required Python libraries:
# - fastapi web framework
# - uvicorn ASGI server to run FastAPI
# - requests HTTP client (for fetching your M3U and TMDb)
RUN pip install --no-cache-dir fastapi uvicorn requests

# (Optional) If your healthcheck uses wget/curl, you can install one here.
# Commented out by default because our README uses a Python healthcheck.
# RUN apt-get update && apt-get install -y --no-install-recommends wget \
#     && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy your application into the container image
COPY app.py /app/app.py

# The app listens on port 9000 (we will map this in docker-compose)
EXPOSE 9000

# Start the FastAPI app using uvicorn.
# 0.0.0.0 = listen on all network interfaces.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9000"]
