FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY . .
RUN SECRET_KEY=build-only .venv/bin/python manage.py collectstatic --noinput

FROM python:3.13-slim
RUN useradd --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build /app /app
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 PORT=8080
USER 10001
EXPOSE 8080
# Cloud Run gives one or more vCPUs per instance; threads cover the time spent waiting on Postgres and Redis.
# No control socket: nothing manages gunicorn from inside the container, and the user has no home to put it in.
CMD exec gunicorn config.wsgi --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 60 --access-logfile - --no-control-socket
