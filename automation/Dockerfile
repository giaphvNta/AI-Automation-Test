FROM mcr.microsoft.com/playwright:v1.60.0-noble

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      ffmpeg \
      x11vnc \
      novnc \
      websockify && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
