FROM python:3.14-slim@sha256:caaf356f40667c496d405780745b9ac25771c189a51dfcc42430d531ea09f8a2

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# paho-mqtt is the only dependency: the exposition format is hand-rendered
# rather than pulling in prometheus_client, which keeps this image to one
# third-party package on an appliance that runs unattended.
RUN pip install --no-cache-dir "paho-mqtt>=2.0,<3"

COPY pecron_exporter.py ./

USER nobody

EXPOSE 9836

CMD ["python", "-u", "/app/pecron_exporter.py"]
