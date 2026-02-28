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

# ── ODA File Converter telepítés (opcionális – ha fail, folytatódik) ──
RUN wget -q -O /tmp/ODAFileConverter.deb \
    "https://download.opendesign.com/guestfiles/ODAFileConverter/ODAFileConverter_QT5_lnxX64_7.6dll_25.4.deb" \
    && dpkg -i /tmp/ODAFileConverter.deb \
    && rm /tmp/ODAFileConverter.deb \
    || (echo "WARNING: ODA install failed, continuing without ODA" && rm -f /tmp/ODAFileConverter.deb)

RUN find /usr /opt -name "ODAFileConverter" 2>/dev/null || echo "ODA not found"
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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["python", "worker.py"]
