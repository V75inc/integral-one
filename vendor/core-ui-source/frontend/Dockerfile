# Production SPA image — static assets behind nginx; API/WebSocket routing
# is handled by Traefik (see deploy/docker-compose.prod.yml).

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Same-origin /api when unset (Traefik path routing on one hostname).
# Override at build time for split-host deploys, e.g.:
#   --build-arg VITE_API_URL=https://api.example.com
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# nginx.conf       — production (Traefik routes /api to the API container)
# nginx.docker.conf — local compose (nginx proxies /api and /ws to api:4000)
#
# Both are envsubst templates, not finished configs: they interpolate
# CSP_EXTRA_CONNECT / CSP_EXTRA_IMG into the Content-Security-Policy so the
# API origin can differ per environment without rebuilding the image. Installed
# under /etc/nginx/templates so the base image's
# /docker-entrypoint.d/20-envsubst-on-templates.sh renders them into
# /etc/nginx/conf.d/default.conf on container start.
ARG NGINX_CONF=nginx.conf
COPY ${NGINX_CONF} /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Default the CSP's connect-src to the API origin this image was built against.
#
# The SPA can only ever call the origin baked into its bundle, so that origin —
# and nothing else — is what connect-src has to allow. Deriving it here instead
# of configuring it per environment means the policy cannot drift from the app:
# both come from the same build arg, resolved by
# deploy/ci-resolve-vite-api-url.sh.
#
# It is also correct in both topologies without a special case:
#   split-host  VITE_API_URL set   -> allow that origin (https + wss for
#                                     /api/events)
#   same-origin VITE_API_URL empty -> stays empty; `connect-src 'self'` in the
#                                     template already covers it
#
# The alternative was a CSP_EXTRA_CONNECT value in each environment's env-file
# secret. That is a hostname, not a credential, and duplicating it invites the
# one failure this arrangement cannot have: a mismatch shows up only as a
# browser console error, with every server-side healthcheck still green.
#
# Runtime still wins — the stack files may set CSP_EXTRA_CONNECT to override
# this (an extra origin, a CDN), and envsubst reads whatever is set.
#
# The derivation lives in an entrypoint script rather than an ENV because the
# wss:// form needs scheme substitution, which Dockerfile expansion cannot do.
# `.envsh` (not `.sh`) is deliberate: nginx's entrypoint SOURCES .envsh and
# EXECUTES .sh, so only .envsh can export a variable that the later
# 20-envsubst-on-templates.sh will see. The 15- prefix orders it before that.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
#
# --chmod=0755 is load-bearing, not tidiness: nginx's entrypoint sources a
# .envsh only `if [ -x "$f" ]` and otherwise logs "not executable, ignoring"
# and moves on. A 0644 copy is skipped silently, connect-src renders as the
# literal "${CSP_EXTRA_CONNECT}", and the browser drops the whole policy —
# green container, broken CSP. Verified by rendering the config in the built
# image.
COPY --chmod=0755 docker-entrypoint.d/15-csp-connect-default.envsh \
     /docker-entrypoint.d/15-csp-connect-default.envsh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
