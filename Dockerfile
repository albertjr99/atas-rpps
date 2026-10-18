# ── Etapa 1: build do frontend (React, visual do ATA) ──────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 120000
COPY frontend/ ./
RUN CI=false GENERATE_SOURCEMAP=false yarn build

# ── Etapa 2: backend (FastAPI) servindo a API e o build ─────────────────────────
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production \
    DATABASE_PATH=/data/atas.db UPLOAD_DIR=/data/uploads
WORKDIR /app
# ffmpeg divide gravações longas (Zoom/Meet/Teams) em partes para a transcrição
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /app/frontend/build ./static
RUN useradd --create-home appuser && mkdir -p /data && chown -R appuser /data /app
USER appuser
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
