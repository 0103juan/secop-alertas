# The Angular client, built once; Django serves the result from the same origin as the API.
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build

FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY . .
COPY --from=frontend /frontend/dist /app/frontend/dist
RUN SECRET_KEY=build-only .venv/bin/python manage.py collectstatic --noinput

FROM python:3.13-slim
RUN useradd --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build /app /app
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 PORT=8080
USER 10001
EXPOSE 8080
# Cloud Run gives one or more vCPUs per instance; threads cover the time spent waiting on Postgres and Redis.
# --preload: the app (see config/wsgi.py) loads once, before the port opens, and the workers fork from it.
# No control socket: nothing manages gunicorn from inside the container, and the user has no home to put it in.
CMD exec gunicorn config.wsgi --bind 0.0.0.0:$PORT --preload --workers 2 --threads 4 --timeout 60 --access-logfile - --no-control-socket
