FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/data/hf-cache \
    GRADIO_SERVER_NAME=0.0.0.0 \
    GRADIO_SERVER_PORT=7860 \
    CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_CPU_ALL_VARIANTS=ON"

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git libgomp1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
WORKDIR /home/user/app

COPY --chown=user:user requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY --chown=user:user app.py .

USER user
RUN mkdir -p /data/hf-cache

EXPOSE 7860
CMD ["python", "app.py"]
