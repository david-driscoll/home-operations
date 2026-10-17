FROM python:3.15-slim@sha256:d802f03223b9e00604cd54574bcac1a4638914c43683d3f0afd6ebee35f25313

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
