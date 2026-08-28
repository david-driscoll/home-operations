FROM python:3.14-slim@sha256:cae66f2ef0ec51a9891263eeee7f987dacf0a9879e8aa9353d5606e0530619a5

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
