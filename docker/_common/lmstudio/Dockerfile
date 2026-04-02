FROM ubuntu:24.04

# Install ROCm following official AMD installation guide
# Reference: https://rocm.docs.amd.com/projects/install-on-linux/en/latest/

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    wget \
    libatomic1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Register ROCm repository (Ubuntu 24.04 - Noble) with proper GPG key and pinning
RUN mkdir -p /etc/apt/keyrings && \
    wget https://repo.radeon.com/rocm/rocm.gpg.key -O - | \
    gpg --dearmor | tee /etc/apt/keyrings/rocm.gpg > /dev/null && \
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/rocm.gpg] https://repo.radeon.com/rocm/apt/7.2.1 noble main" | tee /etc/apt/sources.list.d/rocm.list > /dev/null && \
    printf 'Package: *\nPin: release o=repo.radeon.com\nPin-Priority: 600\n' | tee /etc/apt/preferences.d/rocm-pin-600 > /dev/null && \
    apt-get update

# Install ROCm - HIP runtime for GPU compute (minimal set to avoid conflicts)
RUN apt-get install -y \
    rocm-hip-runtime \
    hip-runtime-amd \
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
