FROM python:3.15-slim@sha256:490c3463f3766091067a01528e6be3208104eebcca11a306beab5de9672ee893

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
