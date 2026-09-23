FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn9-devel

ARG WAN_COMMIT=1ea34ff48f87168174e12956e200b1d908b1c5ff

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    WAN_DIR=/opt/Wan2.2 \
    WAN_CKPT_DIR=/runpod-volume/Wan2.2-TI2V-5B

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/Wan-Video/Wan2.2.git \
    && cd Wan2.2 \
    && git checkout "$WAN_COMMIT"

RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir -r /opt/Wan2.2/requirements.txt

WORKDIR /opt/zaynab-worker
COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY handler.py ./handler.py

CMD ["python", "-u", "handler.py"]
