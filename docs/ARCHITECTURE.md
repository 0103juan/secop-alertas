# Architecture

How secop-alertas is built and why: the process that led to each decision, the alternatives that were turned
down, and where the database was tuned, with the query plans measured before and after.

## 1. The problem and its constraints

A user wants to hear about public contracts that matter to them ("road works in Cauca above 500 million pesos")
as soon as SECOP publishes them, and wants a few readings over the data (possible contract splitting, unusual
values). Those needs come with constraints, and the constraints drove the design more than the features did:

| Constraint | Consequence |
|---|---|
| The source is a public portal (datos.gov.co) that times out and publishes once a day | Ingestion is a batch job with retries and a resumable cursor, separate from the web service |
| Pub/Sub, like every managed queue, delivers **at least once** | Every consumer must be idempotent; duplicates are handled by the database, not by hoping |
| A lost alert is worse than a late one | Events are written in the same transaction as the data (outbox); deliveries are retried with backoff |
| The demo runs on free-trial credits | One warm instance billed at the idle rate (no cold start for a visitor), share an existing Cloud SQL instance, Redis as a sidecar instead of Memorystore |
| The readings touch tens of thousands of rows per request | Vectorised algorithms in NumPy, results cached; anything bigger belongs in a batch job |

## 2. How the design was reached

The design started from the flow of one contract, not from a framework layout:

1. **A contract appears or changes upstream.** Something has to notice. SECOP has no webhooks, so the only option
   is polling, and polling once a day matches how often it publishes. → a scheduled job (Cloud Scheduler → Cloud Run
   job), not a long-running worker.
2. **It is stored.** The id comes from SECOP, so storing is an upsert; seeing a row twice is normal, not an error.
   → SECOP's id is the primary key and each page is one `INSERT ... ON CONFLICT DO UPDATE`.
3. **Someone must be told it changed.** The job should not know who cares. → a domain event, `contracts.changed`,
   published to a topic (Observer). The alerts app subscribes; a future app (search index, statistics) can subscribe
   without touching ingestion.
4. **The event must not be lost or invented.** Publishing after the commit loses it if the process dies in between;
   publishing before announces data that may roll back. → the transactional outbox (section 5.3).
5. **Each subscription's rules run against the contract.** The rules are user data (JSON), so they need to become
   code safely. → a factory that validates and builds rule objects, the same one the API uses to reject bad input.
6. **Matches are sent.** Receivers fail and are slow. → a delivery queue with leases and exponential backoff, kept
   apart from matching so a slow webhook never blocks matching.

Each step became one module with one reason to change, which is where the app boundaries below come from.

### Alternatives considered

| Decision | Chosen | Turned down, and why |
|---|---|---|
| Async work | Pub/Sub push to the web service | **Celery + a broker**: another always-on worker and broker to run and pay for; push needs neither and scales to zero |
| Publishing events | Transactional outbox | **Publish after commit**: loses the event on a crash between the two. **Django signals**: in-process only, cannot cross to another service |
| Running the containers | Cloud Run (service + job) | **GKE**: a cluster's fixed cost for one service; Cloud Run gives the same container contract and scales to zero. The Terraform in `terraform-cloud-platform` covers GKE for when it pays |
| Cache and throttling | Redis sidecar per instance | **Memorystore**: about 36 USD a month for state that may be lost (a cache) |
| Sending alerts | Lease, then send with no transaction open | **Row lock held while sending**: a 10 s webhook would hold locks and a connection for 10 s |
| Keyword matching in the database | Trigram index on an immutable unaccent | **Full-text search**: stems words ("puentes" → "puent"), which is not the substring semantics the in-memory matcher has, so the stream and the preview would disagree |
| Pagination | Cursor | **Offset**: page 1,000 reads and discards 50,000 rows; a cursor seeks on an index |
| Readings | pandas/NumPy in the request, cached | **SQL window functions**: possible for splitting, but the O(n log n) packed-key search and the robust statistics are clearer and testable against a reference in Python |

## 3. Structure

```
config/        settings from the environment, URLs, WSGI, health probes
accounts/      sign-up and JWT                                (serializers, views, urls)
contracts/     the data: model, source port + Socrata adapter, ingestion, read API, event names
alerts/        subscriptions: rules, matching, delivery, notifiers, event handlers, API
events/        the bus (in-process or Pub/Sub), the outbox, the Pub/Sub push endpoint
analytics/     readings: splitting and outliers (pure functions), data loading and caching, API
deploy/gcp/    Terraform for the whole runtime
tests/         one file per behaviour, against a real Postgres
```

Dependencies point one way: `alerts → contracts → events`, `analytics → contracts`. `contracts` never imports
`alerts`: it announces `contracts.changed` (named in `contracts/events.py`) and `alerts/handlers.py` listens. That
is what lets ingestion be tested with a recorder instead of the alerts machinery, and what would let alerts move to
its own service: only the transport changes.

Inside each app, Django's conventional modules (`models`, `serializers`, `filters`, `views`, `urls`, `admin`) hold
the framework code, and the domain logic lives in modules named after what they do (`ingestion`, `sources`,
`rules`, `matching`, `delivery`, `notifiers`, `splitting`, `outliers`). Views are thin: validate input, call the
domain, serialize.

## 4. Patterns and SOLID, where and why

| Pattern | Where | Why here |
|---|---|---|
| Strategy | `alerts/rules.py`: `KeywordRule`, `EntityRule`, `AmountRule`, `DepartmentRule`, `ModalityRule` | Each rule kind is an interchangeable algorithm behind `matches()` and `as_q()` |
| Composite | `alerts/rules.py`: `AllOf` | A subscription's rules are themselves a rule, so the matcher treats one rule and ten the same way |
| Factory | `rules.build()` with a registry; `notifiers.notifier_for()` | User JSON becomes objects in one place that validates it; channels map to senders in one place |
| Template Method | `rules._InListRule` | Department and modality rules share the algorithm and differ in one field name |
| Observer | `events/bus.py`: `subscribe`, `dispatch`, `EventBus` | Producers do not know their consumers; the transport (in-process or Pub/Sub) is swappable |
| Singleton | `events.bus.get_bus()` (`functools.cache`) | The Pub/Sub client holds a gRPC channel and batching threads meant to be shared per process |
| Adapter / ports and adapters | `contracts/sources.py`: `ContractSource` protocol, `SocrataSource` | Ingestion depends on "something that yields pages", not on HTTP; tests pass a list |

SOLID in practice:

- **Single responsibility**: matching (`matching.py`) and sending (`delivery.py`) were one function in the first
  version; they change for different reasons (rule semantics versus network failure handling) and are now split.
- **Open/closed**: a new rule kind is one class with `@register`; a new channel is one class and one dictionary
  entry. Neither touches the matcher, the API or the delivery loop.
- **Liskov**: every `Rule` honours the same contract, and `tests/test_rules.py` checks the strongest form of it:
  `matches()` and `as_q()` agree on 40 random rule sets over 120 random contracts.
- **Interface segregation**: `ContractSource` and `EventBus` are one-method protocols; the ingestor needs nothing
  else from them.
- **Dependency inversion**: `ContractIngestor(source, bus)` receives its collaborators; only the management command
  wires the real ones.

## 5. Data model and database decisions

### 5.1 Integrity in the schema, not only in code

- `Contract.id` is SECOP's id, so a repeated row is an update by construction.
- `UNIQUE (subscription, contract)` on `Alert` is what makes a redelivered event harmless: the insert uses
  `ON CONFLICT DO NOTHING`. Code that checked "does the alert exist?" first would race under concurrent pushes; the
  constraint cannot.
- `Subscription.clean()` builds the rules, so the Django admin cannot store a rule the matcher would skip.

### 5.2 Indexes come from queries

Every index in `contracts/models.py` names the query it serves. They were chosen by running `EXPLAIN ANALYZE` on the
SQL Django actually generates, over the 36,254 real contracts (Postgres 17, local), before and after:

| Query (from the API) | Before | After | Index and reason |
|---|---|---|---|
| `GET /contracts/` (newest first, cursor) | Seq Scan + top-N sort, **19.1 ms** | Index Scan, **0.39 ms** | `(signed_on DESC, id)`: the cursor's order, read straight off the index |
| `GET /contracts/?department=cauca` | Seq Scan, **18.3 ms**, planner expected 181 rows | Index Scan, **0.49 ms**, expects 36,254 | `(UPPER(department), signed_on DESC)`. `iexact` compiles to `UPPER(department) = UPPER(%s)`; a plain column index cannot serve that. An expression index can, and Postgres keeps statistics for the expression, which fixed the 200× wrong row estimate |
| Subscription preview, keyword rule | Seq Scan, **200 ms**, 36,203 rows discarded | Bitmap Index Scan, **3.8 ms** | GIN trigram on `UPPER(immutable_unaccent(object))`. `LIKE '%word%'` cannot use a B-tree; trigrams can |
| `GET /contracts/?q=puente` | Bitmap Index Scan, 2.5 ms | same | GIN on `to_tsvector('spanish', object)`, already right; the filter builds the identical expression |
| Analytics load (whole department) | Seq Scan, 13-25 ms | Seq Scan | Correct as is: it reads every row of the department, and here that is the whole table. An index would add random reads |

Two details made the trigram index possible:

- `unaccent()` is `STABLE`, and index expressions must be `IMMUTABLE`. Migration `0002` creates
  `immutable_unaccent(text)`, which pins the dictionary; `contracts/expressions.py` exposes it to the ORM.
- The query must use *exactly* the indexed expression. `KeywordRule.as_q()` builds it from the same helper
  (`folded("object")`) that the index definition uses, so they cannot drift apart.

Removed: `(entity_nit, supplier_doc, signed_on)` (2.3 MB) and `(modality, contract_type)`, because
`pg_stat_user_indexes` showed **zero scans** for both after the test suite and the API calls above (the splitting
reading sorts in NumPy, not in SQL, and no query filters on modality and type together); and a boolean index on
`Subscription.active`, which is true for nearly every row and so never selective. Unused indexes cost space and slow
every write.

Added on alerts: a **partial** index on undelivered alerts, `(created_at) WHERE delivered_at IS NULL`. The delivery
queue only ever asks for undelivered rows, so the index holds the backlog, not the whole history.

Cost, measured: the table is 25 MB and its indexes 29 MB, 15 MB of it the trigram index. A full reload of the
36,254 contracts took 48 s with the new indexes and 47 s without: the load is bound by the open-data portal, not by
index maintenance. At a much higher write rate the trigram index is the first one to reconsider.

The planner does not use every index for every query: for the largest entity (23 % of rows) it reads
`(signed_on DESC, id)` and filters, 0.23 ms, instead of the entity index. That is the right call, and the reason to
measure instead of assuming.

### 5.3 Transactions and write patterns

- **One transaction per page** (`ContractIngestor._load`): upsert 2,000 contracts, move the cursor, write the outbox
  rows. All or nothing, so a crash never skips a page and never announces a page that was not stored.
- **Bulk upsert** with `bulk_create(update_conflicts=True)`: one statement per page instead of 2,000.
- **Reads for pandas skip the ORM's objects**: `values_list()` of only the needed columns, straight into a
  DataFrame. Building 36,000 model instances is most of the cost of reading them through the ORM.
- **No functions on indexed columns in filters**: `signed_after` compares `signed_on >= <start of day>`, not
  `signed_on::date >= ...`, which would hide the column from the index.
- **`SKIP LOCKED`** for the two work queues (the outbox relay and alert delivery): concurrent workers take
  different rows instead of waiting for each other or taking the same one.

## 6. Failure modes

| What fails | What happens |
|---|---|
| datos.gov.co times out or answers 5xx | Retried with backoff (5, 10, 20 s); 4xx is not retried. The job's next run resumes from the cursor |
| The job dies mid-ingestion | Committed pages stay committed with their outbox rows; the next run resumes and publishes what is pending |
| Pub/Sub is unreachable | The outbox rows stay pending; the next run publishes them (tested) |
| A push arrives twice | Alerts are unique per (subscription, contract); nothing is added or sent twice |
| The handler fails | 500, so Pub/Sub retries with backoff (10 s to 10 min); after 5 attempts the message goes to `contracts-changed-dead`, kept a week |
| A malformed message | Acknowledged and logged: retrying cannot fix it |
| A webhook receiver is down | The alert stays undelivered; retried at 1, 2, 4, 8 minutes, then left for a person after 5 attempts |
| A worker dies mid-send | Its lease expires after 2 minutes and another worker sends the alert |
| Postgres is down | `/readyz` fails, so new instances take no traffic; `/healthz` does not touch the database, so running instances are not all restarted at once |

## 7. Security

- **Pub/Sub push**: the endpoint is public (Cloud Run), so it verifies the Google-signed OIDC token: signature,
  audience and the dedicated push service account.
- **Webhooks**: signed with `HMAC-SHA256(secret, timestamp.body)`; the receiver can reject replays by timestamp.
  Targets must be https and resolve to public addresses, checked on save and again on send (DNS can change): no
  calls to `169.254.169.254` or the private network (SSRF).
- **Authorisation by queryset**: a user's querysets are filtered by owner, so someone else's id answers 404.
- **Least privilege**: four service accounts (web, ingestion, push, scheduler), each with only its roles; secrets in
  Secret Manager, read at start.
- **Data minimisation**: the supplier's document number is stored to group contracts and never returned; serializers
  list their fields instead of excluding, so a new column is private until someone publishes it.
- **Abuse**: anonymous reads are throttled (60/min), sign-up 10/hour per address.

## 8. Algorithms

See the README for the full description. In short: splitting detection packs (group, time) into one sorted int64
key so one `searchsorted` finds every window, prefix sums give each window's total in O(1), and the whole reading is
O(n log n); a quadratic reference implementation checks it on random data. A first version that looped over groups
in Python took 0.97 s over the 36,254 contracts; the vectorised one takes 0.11 s with the same 184 clusters.

## 9. What changes at a larger scale

| Signal | Next step |
|---|---|
| Thousands of subscriptions | An inverted index from keyword, NIT and department to subscriptions, so each contract meets only candidates (today it is n × m) |
| The whole country (millions of contracts) | Readings move to a batch job writing results to a table (or BigQuery), served from there; the request path only reads |
| Many instances | Memorystore, so the cache and throttling counters are shared |
| Retries that cannot wait for the next push | A Cloud Scheduler job running `deliver_alerts` every few minutes |
| Higher write rate | Revisit the trigram index; partition `contracts` by signing year |

## 10. How it is tested

- Against a **real Postgres** (CI starts one): upserts, `ON CONFLICT`, `SKIP LOCKED`, full-text search and the
  trigram expression are database behaviour, and a SQLite or mocked test would not prove them.
- **Property-style checks** where two implementations must agree: rules in memory versus in SQL, the O(n log n)
  splitting versus the O(n²) reference.
- **Failure injection**: Pub/Sub down during ingestion, a 503 from the source, webhooks answering 500, an expired
  lease, a forged or misaddressed OIDC token.
- CI also checks that migrations match the models, builds the image and validates the Terraform.

## 11. The web client (Angular 22)

`frontend/` is the browser client: search, the two readings, sign-up and the alert editor. It is built into the
image and served by Django from the same origin as the API (`config/spa.py`, WhiteNoise for the files).

| Decision | Why |
|---|---|
| Same origin as the API | No CORS, and the refresh cookie can be `SameSite=Strict`, which is the CSRF defence |
| Access token in memory, refresh token in an `HttpOnly` cookie | A script injected into the page cannot read either: the access token is not in `localStorage`, and JavaScript cannot see the cookie. A reload restores the session from the cookie (`Session.restore` at start-up) |
| One interceptor refreshes on 401, single-flight | Several calls that expire together share one refresh (`shareReplay`) instead of racing; a failed refresh ends the session and sends the user to sign in with `?next=` (checked against open redirects) |
| Types generated from the OpenAPI document | `openapi.yaml` is generated from the serializers and `schema.d.ts` from it; CI fails if either is stale, so a renamed field breaks the build, not a page |
| Signals throughout, `httpResource` for reads | Zoneless change detection, OnPush everywhere; a resource refetches when its URL signal changes and cancels the previous request |
| `CursorList` for DRF cursor pagination | Appends pages and drops answers from a superseded search (a generation counter), so a slow "ví" cannot overwrite "vías" |
| Filters in the URL | A search can be shared, and the back button undoes a filter; the page writes query params and reads them as inputs |
| Signal forms, with server errors mapped to fields | Client rules mirror the API's (`rules.problem`), and a 400 from DRF lands under the input it is about (`core/forms.ts`) |
| Lazy routes, private ones behind `canMatch` | A signed-out visitor never downloads the private chunks; initial bundle 82 kB compressed |

Structure: `core/` (API types and helpers, session, interceptor, guard, pagination, formatting), `features/` (one
folder per area: contracts, analytics, auth, subscriptions), `shared/` (contract card, field errors, 404).

Tested at two levels: 19 Vitest unit tests for the parts with logic (rule mapping and validation, the interceptor's
refresh and single-flight, the pagination race, form helpers), and 17 Playwright tests against the real stack
(Django, Postgres seeded with `manage.py seed_demo`, the built client), including a phone viewport. Run three times
in a row: 51 of 51 passed.
