# ── Build stage ───────────────────────────────────────────────
FROM python:3.14-slim AS builder

WORKDIR /build
COPY requirements.txt .
# Install CPU-only torch first. The embedding worker runs on CPU, so the
# default CUDA torch (~5GB of GPU libraries) is unnecessary bloat. PYTHONPATH
# lets the next pip call see torch is already satisfied and skip the CUDA build.
ENV PYTHONPATH=/install/lib/python3.11/site-packages
RUN pip install --default-timeout=1000 --no-cache-dir --prefix=/install torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --default-timeout=1000 --no-cache-dir --prefix=/install -r requirements.txt

# ── Runtime stage ────────────────────────────────────────────
FROM python:3.14-slim

WORKDIR /app
ENV PYTHONPATH=/app

# System dependencies for PyMuPDF and other C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libglib2.0-0 libsm6 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY . .

# Create non-root user
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
