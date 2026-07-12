# ============================================================================
# docker/web/Dockerfile
# ============================================================================
#
# Multi-stage web image for Farmaura portals.
#
# Responsibilities:
# - build the React/Vite frontend during the image build stage;
# - package the marketplace and internal portal static assets into Nginx;
# - serve both portals behind a single runtime container with API proxy support.
#
# Observations:
# - npm runs during docker build, not on container restart;
# - the runtime image contains only compiled static assets plus Nginx config.

FROM node:22.17.1-alpine AS frontend-build

WORKDIR /app/farmaura

COPY ["farmaura/package.json", "farmaura/package-lock.json", "./"]
RUN npm ci

COPY ["farmaura", "./"]
RUN npm run build

FROM nginx:1.29.1-alpine AS runtime

COPY ["docker/web/nginx.conf", "/etc/nginx/conf.d/default.conf"]
COPY ["docker/web/index.html", "/usr/share/nginx/html/index.html"]
COPY --from=frontend-build ["/app/farmaura/dist/", "/usr/share/nginx/html/"]

EXPOSE 80
