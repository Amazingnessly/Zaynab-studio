FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-devel

ARG WAN_COMMIT=1ea34ff48f87168174e12956e200b1d908b1c5ff

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    WAN_DIR=/opt/Wan2.2 \
    WAN_MODEL_ID=Wan-AI/Wan2.2-TI2V-5B

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/Wan-Video/Wan2.2.git \
    && cd Wan2.2 \
    && git checkout "$WAN_COMMIT"

RUN python -m pip install --upgrade pip setuptools wheel \
    && sed '/^flash_attn/d' /opt/Wan2.2/requirements.txt > /tmp/wan-requirements.txt \
    && python -m pip install --no-cache-dir -r /tmp/wan-requirements.txt \
    && MAX_JOBS=2 python -m pip install --no-cache-dir --no-build-isolation "flash-attn==2.8.3.post1"

WORKDIR /opt/zaynab-worker
COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY handler.py ./handler.py

CMD ["python", "-u", "handler.py"]
