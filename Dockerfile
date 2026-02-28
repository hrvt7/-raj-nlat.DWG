FROM python:3.11-slim-bookworm

# ── Rendszerfüggőségek ──────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    unzip \
    xvfb \
    libqt5core5a \
    libqt5widgets5 \
    libqt5gui5 \
    libqt5xml5 \
    libqt5network5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── ODA File Converter telepítés ────────────────────────────────
# ODA letöltési URL: https://www.opendesign.com/guestfiles/oda_file_converter
# Linux x64 Qt5 .deb csomag
RUN wget -q -O /tmp/ODAFileConverter.deb \
    "https://download.opendesign.com/guestfiles/ODAFileConverter/ODAFileConverter_QT5_lnxX64_7.6dll_25.4.deb" \
    && dpkg -i /tmp/ODAFileConverter.deb || apt-get -f install -y \
    && rm /tmp/ODAFileConverter.deb \
    && which ODAFileConverter || echo "ODA installed to non-standard path"

# ODA bináris helye ellenőrzés és PATH beállítás
RUN find / -name "ODAFileConverter" -type f 2>/dev/null | head -5 || true
ENV ODA_PATH=/usr/bin/ODAFileConverter

# ── Python környezet ────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Alkalmazás kód ──────────────────────────────────────────────
COPY app/ .

# ── Környezeti változók ──────────────────────────────────────────
ENV QT_QPA_PLATFORM=offscreen
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["python", "worker.py"]
