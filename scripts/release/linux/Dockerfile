FROM node:22.22.2-bullseye-slim AS node
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file git libayatana-appindicator3-dev libfuse2 \
    librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev libxdo-dev patchelf pkg-config \
    python3 rpm wget xdg-utils && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/ /usr/local/
RUN npm install -g pnpm@11.28.5
ENV PATH=/root/.cargo/bin:$PATH
RUN curl --fail --silent --show-error https://sh.rustup.rs -o /tmp/rustup.sh && \
    sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.95.0
ENV APPIMAGE_EXTRACT_AND_RUN=1
WORKDIR /src
