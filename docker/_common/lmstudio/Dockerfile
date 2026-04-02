FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    rocm-core \
    rocm-libs \
    rocm-dev \
    rocm-utils \
    libatomic1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set ROCm environment for HIP/GPU support
ENV ROCM_HOME=/opt/rocm
ENV PATH=/opt/rocm/bin:${PATH}
ENV LD_LIBRARY_PATH=/opt/rocm/lib:/opt/rocm/lib64:${LD_LIBRARY_PATH}

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1234

ENTRYPOINT ["/entrypoint.sh"]
