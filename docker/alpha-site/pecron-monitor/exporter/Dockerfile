FROM python:3.14-slim@sha256:ce40764625a4ff50df3548277632e7f96c4e77fe75fa848aae9885476e7df5a4

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
