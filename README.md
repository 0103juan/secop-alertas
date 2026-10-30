# secop-alertas

Alerts and readings over Colombia's public contracting data (SECOP II, open data on datos.gov.co), built with
**Django and Django REST Framework** on **PostgreSQL**, **Redis** and **Google Cloud** (Cloud Run, Cloud SQL,
Pub/Sub, Cloud Scheduler, Secret Manager), with the infrastructure in **Terraform**.

A user subscribes with rules ("road works in Cauca above 500 million pesos"), and every contract that SECOP
publishes or updates is matched against them; matches go out by email or by a signed webhook. Two readings run
over the loaded data: possible contract splitting (an O(n log n) sliding window) and value outliers (robust
statistics with SciPy). The readings describe patterns in public data; they do not judge any entity.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** explains how the design was reached, the alternatives turned down,
the structure, and the database tuning with query plans measured before and after.

## What it shows

| Area | Where |
|---|---|
| Django + DRF: viewsets, routers, `django-filter`, cursor pagination, JWT, per-scope throttling, OpenAPI | `*/views.py`, `*/serializers.py`, `contracts/filters.py`, `config/` |
| Strategy, Composite, Template Method and Factory: alert rules built from JSON | `alerts/rules.py` |
| Factory: one notifier per channel (email, signed webhook) | `alerts/notifiers.py` |
| Observer: domain events with an in-process or Pub/Sub transport | `events/bus.py`, `alerts/handlers.py` |
| Singleton: one Pub/Sub client per process | `events/bus.py` (`get_bus`) |
| Ports and adapters: ingestion depends on a `ContractSource` protocol, not on HTTP | `contracts/sources.py`, `contracts/ingestion.py` |
| Transactional outbox: no event lost or invented between the database and Pub/Sub | `events/models.py`, `events/outbox.py` |
| Idempotency, leases and backoff for at-least-once delivery | `alerts/matching.py`, `alerts/delivery.py` |
| Algorithms: sliding window with prefix sums and binary search, checked against a brute-force reference | `analytics/splitting.py` |
| Robust statistics with pandas, NumPy and SciPy | `analytics/outliers.py` |
| Security: OIDC-verified Pub/Sub push, HMAC-signed webhooks, SSRF guard, owner-scoped querysets | `events/push.py`, `alerts/notifiers.py`, `alerts/views.py` |
| PostgreSQL tuned from `EXPLAIN ANALYZE`: expression, trigram, full-text and partial indexes (200 ms to 3.8 ms on the slowest query) | `contracts/models.py`, `alerts/models.py`, [docs](docs/ARCHITECTURE.md#5-data-model-and-database-decisions) |
| GCP in Terraform: Cloud Run service + job, Pub/Sub with dead letters, Scheduler, Secret Manager, least-privilege accounts | `deploy/gcp/main.tf` |

## Architecture

```
Cloud Scheduler (daily) --> Cloud Run job: migrate, then read a slice of SECOP II
                               | one transaction per page: upsert contracts, move the cursor, write outbox rows
                               | then publish the outbox
                               v
                            Pub/Sub "contracts-changed" --push + OIDC token--> Cloud Run "secop-alertas"
                               | after 5 failed pushes                          /internal/events/pubsub
                               v                                                rules -> alerts -> email/webhook
                            Pub/Sub "contracts-changed-dead"

Cloud Run "secop-alertas": Django (gunicorn) + Redis sidecar (cache, throttling)
Both reach Cloud SQL for PostgreSQL through the connector socket; secrets come from Secret Manager.
```

Locally the same code runs with `EVENT_BUS=inprocess`: the bus calls the handlers directly, so there is nothing
to run but Postgres.

## Design decisions

**Rules answer twice, and both answers must agree.** Each rule has `matches(contract)`, which runs in memory over
the stream of new contracts that are already loaded, and `as_q()`, a database filter for previews over history.
The two can drift apart, so `tests/test_rules.py` builds 40 random rule sets over 120 random contracts and
requires the same result from both. A new kind of rule is one class with `@register`; the factory, the API
validation and the matcher do not change (open/closed).

**The outbox instead of publishing after commit.** Publishing to Pub/Sub after the commit loses the event if the
process dies in between; publishing before it announces data that may roll back. Each page's contracts, its
cursor and its event are written in one transaction; `relay()` publishes afterwards, one row per transaction,
with `SKIP LOCKED` so two relays never send the same row. A test makes Pub/Sub fail and checks that the next run
sends the event.

**At-least-once everywhere, so everything is idempotent.** Contracts are upserted by SECOP's id; an alert is
unique per (subscription, contract), so a redelivered event adds nothing; delivery locks rows with `SKIP LOCKED`
so two concurrent pushes do not email the same alert twice. A malformed message is acknowledged (it would never
succeed), a failing handler returns 500 so Pub/Sub retries with backoff, and after five attempts the message
moves to a dead-letter topic kept for a week.

**The push endpoint trusts a token, not a network.** Cloud Run's URL is public. Pub/Sub signs each push with a
Google OIDC token for a dedicated service account; the view checks the signature, the audience and the account.

**Webhooks are signed and cannot point inward.** Payloads carry `HMAC-SHA256(secret, timestamp.body)`, as Stripe
and GitHub do. Targets must be https and resolve only to public addresses, checked when saved and again when
sent, because DNS can change in between (SSRF).

**Users see only their own data, and 404 says nothing.** Querysets are filtered by owner, so another user's
subscription answers 404, not 403, and ids cannot be probed.

## Algorithms

### Possible contract splitting, O(n log n)

One entity signs several contracts with the same supplier within `window_days`, each below a threshold, that
together reach it.

1. Sort by (entity, supplier, date). O(n log n).
2. Pack (group number, milliseconds) into one sorted int64 key, so a single `np.searchsorted` finds, for every
   contract at once, the last contract of its group within the window. O(n log n).
3. The value of any run is a difference of prefix sums. O(1) each.
4. A run contained in the previous one is dropped, so one burst comes out once. Because window ends never
   decrease inside a group, this is a vectorised comparison with the previous candidate.

`brute_force()` is the O(n²) reference (scan forward from each contract); `tests/test_analytics.py` runs both on
30 random data sets and requires identical clusters, plus the boundary cases (a window exactly `window_days` long
counts; a contract exactly at the threshold does not).

Measured on this machine over the 36,254 Cauca contracts signed since 2025: a first version that looped over the
9,874 groups with two or more contracts took 0.97 s; the packed-key version takes 0.11 s and finds the same 184
clusters. The whole endpoint, including loading the rows from Postgres, answers in about 0.3 s, then from the
Redis cache in 1-2 ms.

### Value outliers

Contract values span six orders of magnitude and are heavily skewed, so mean and standard deviation are pulled by
the values being looked for. Per (modality, contract type): log10 of the value, centred on the median and scaled
by the median absolute deviation (`scipy.stats.median_abs_deviation`, normal-consistent), flagged when
|modified z| > 3.5 (Iglewicz and Hoaglin). Groups under 30 contracts are skipped: they have no meaningful "usual".

## API

Interactive documentation at `/api/docs/` (OpenAPI 3 from `drf-spectacular`).

| Method and path | Who | What |
|---|---|---|
| `GET /api/v1/contracts/?q=&department=&modality=&min_value=&signed_after=` | anyone | Spanish full-text search and filters, cursor pagination |
| `POST /api/v1/auth/register/`, `POST /api/v1/auth/token/`, `/token/refresh/` | anyone | account and JWT |
| `GET/POST/PATCH/DELETE /api/v1/subscriptions/` | owner | rules are validated by the same factory the matcher uses |
| `GET /api/v1/subscriptions/{id}/preview/` | owner | the 20 latest contracts the rules would have matched |
| `GET /api/v1/subscriptions/{id}/secret/` | owner | the webhook signing key |
| `GET /api/v1/alerts/` | owner | delivered and pending alerts |
| `GET /api/v1/analytics/splitting/?department=&threshold_cop=&window_days=` | anyone | possible splitting |
| `GET /api/v1/analytics/outliers/?department=` | anyone | value outliers |

A subscription:

```json
{
  "name": "Vías en el Cauca",
  "rules": [
    {"type": "department", "params": {"departments": ["Cauca"]}},
    {"type": "keyword", "params": {"words": ["vías", "pavimentación"]}},
    {"type": "amount", "params": {"min_cop": 500000000}}
  ],
  "channel": "webhook",
  "target": "https://example.org/hooks/secop"
}
```

## Run it

```bash
docker compose up -d                      # Postgres on 5434, Redis on 6380
uv sync
export DEBUG=1 REDIS_URL=redis://localhost:6380/0
uv run python manage.py migrate
uv run python manage.py ingest_secop      # Cauca since 2025: 36,254 contracts in 47 s here
uv run python manage.py runserver
```

Tests run against the real Postgres (full-text search, upserts and row locks are what they check):

```bash
uv run pytest        # 39 tests
uv run ruff check . && uv run ruff format --check .
```

CI runs the same against a Postgres service, checks that migrations match the models, builds the image and
validates the Terraform.

The same pipeline exists for **Jenkins** (`Jenkinsfile`), with a gated deploy to Cloud Run, and `ci/jenkins` starts
a controller configured as code to run it: see [ci/jenkins/README.md](ci/jenkins/README.md).

## Deploy

`deploy/gcp` joins an existing project and Cloud SQL instance, creating a database and user of its own.

```bash
cd deploy/gcp
terraform init -backend-config="bucket=<state bucket>"
terraform apply -target=google_artifact_registry_repository.images -target=google_project_service.this
docker build -t <image_repository>/web:v1 ../.. && docker push <image_repository>/web:v1
terraform apply -var image=<image_repository>/web@sha256:<digest>     # plus project_id and sql_instance
gcloud run jobs execute alertas-ingest --region us-central1 --wait    # first load; then daily at 06:00
```

## Limits

- Email goes to the console backend in the demo, so email alerts are written to the service log, not sent;
  webhooks are sent. A real deployment sets `EMAIL_BACKEND` to an SMTP or API provider.
- Redis runs beside each Cloud Run instance, so the cache and throttling counters are per instance and start
  empty. Memorystore would share them for about 36 USD a month.
- A failed delivery becomes due after its backoff (1 to 8 minutes) but is only retried when something runs
  `deliver_pending`: the next push or the daily job. A Cloud Scheduler job every few minutes would close that gap.
- Matching is n contracts × m subscriptions in memory. With thousands of subscriptions the next step is an
  inverted index from keyword and NIT to subscriptions.
- The splitting reading groups by the supplier's document number, which SECOP publishes; the API never returns
  it. A cluster is a pattern to look at, not evidence of wrongdoing: framework agreements and staged works can
  look the same.
- No GraphQL endpoint.

## Licence

MIT. Contract data: SECOP II on datos.gov.co, published by Colombia Compra Eficiente.
