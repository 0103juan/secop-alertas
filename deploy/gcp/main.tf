# secop-alertas on Google Cloud. It joins an existing project and Cloud SQL instance (a database and a user of
# its own on a shared db-f1-micro) so the demo adds almost nothing to the bill.
#
#   Cloud Scheduler (daily) --> Cloud Run job "alertas-ingest": migrate, then read SECOP II from datos.gov.co
#                                   | writes contracts + outbox rows, then publishes from the outbox
#                                   v
#                               Pub/Sub "contracts-changed" --(push, OIDC token)--> Cloud Run "secop-alertas"
#                                   | after 5 failed pushes                          /internal/events/pubsub
#                                   v                                                matches rules, sends alerts
#                               Pub/Sub "contracts-changed-dead"
#
#   Cloud Run "secop-alertas" = Django (gunicorn) + Redis sidecar (cache and throttling, memory only)
#   Both reach Postgres through the Cloud SQL connector socket; secrets come from Secret Manager.

terraform {
  required_version = ">= 1.10"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "gcs" {
    prefix = "secop-alertas/demo" # the bucket is given at init: terraform init -backend-config="bucket=<name>"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    project    = "secop-alertas"
    managed-by = "terraform"
  }
}

data "google_project" "this" {}

locals {
  services = [
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
  ]
  pubsub_agent = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  push_path    = "/internal/events/pubsub"
}

resource "google_project_service" "this" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "secop-alertas"
  location      = var.region
  format        = "DOCKER"
  depends_on    = [google_project_service.this]
}

# ---- Postgres: a database and a user on the shared instance --------------------------------------------------

data "google_sql_database_instance" "shared" {
  name = var.sql_instance
}

resource "google_sql_database" "alertas" {
  name     = "alertas"
  instance = data.google_sql_database_instance.shared.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# Built-in users belong to cloudsqlsuperuser, which the first migration needs to create the unaccent extension.
resource "google_sql_user" "alertas" {
  name     = "alertas"
  instance = data.google_sql_database_instance.shared.name
  password = random_password.db.result
}

resource "random_password" "django" {
  length  = 50
  special = false
}

locals {
  secrets = {
    "alertas-database-url" = "postgresql://alertas:${random_password.db.result}@/alertas?host=/cloudsql/${data.google_sql_database_instance.shared.connection_name}"
    "alertas-secret-key"   = random_password.django.result
  }
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = each.value
}

# ---- Identities: one per job, each with only what it needs ---------------------------------------------------

resource "google_service_account" "web" {
  account_id   = "alertas-web"
  display_name = "secop-alertas web service"
}

resource "google_service_account" "ingest" {
  account_id   = "alertas-ingest"
  display_name = "secop-alertas ingestion job"
}

resource "google_service_account" "push" {
  account_id   = "alertas-push"
  display_name = "Signs Pub/Sub pushes to secop-alertas"
}

resource "google_service_account" "scheduler" {
  account_id   = "alertas-scheduler"
  display_name = "Starts the secop-alertas ingestion job"
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset([google_service_account.web.email, google_service_account.ingest.email])
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "read" {
  for_each = {
    for pair in setproduct(keys(local.secrets), [google_service_account.web.email, google_service_account.ingest.email]) :
    "${pair[0]}/${pair[1]}" => { secret = pair[0], account = pair[1] }
  }
  secret_id = google_secret_manager_secret.this[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.account}"
}

# ---- Events ----------------------------------------------------------------------------------------------

resource "google_pubsub_topic" "contracts_changed" {
  name                       = "contracts-changed"
  message_retention_duration = "86400s"
  depends_on                 = [google_project_service.this]
}

resource "google_pubsub_topic" "dead" {
  name       = "contracts-changed-dead"
  depends_on = [google_project_service.this]
}

resource "google_pubsub_topic_iam_member" "ingest_publishes" {
  topic  = google_pubsub_topic.contracts_changed.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.ingest.email}"
}

# Pub/Sub mints the push OIDC token as the push account, and moves dead letters, as its own service agent.
resource "google_service_account_iam_member" "pubsub_mints_tokens" {
  service_account_id = google_service_account.push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.pubsub_agent
}

resource "google_pubsub_topic_iam_member" "agent_dead_letters" {
  topic  = google_pubsub_topic.dead.name
  role   = "roles/pubsub.publisher"
  member = local.pubsub_agent
}

resource "google_pubsub_subscription" "dead" {
  name                       = "contracts-changed-dead"
  topic                      = google_pubsub_topic.dead.id
  message_retention_duration = "604800s" # a week to look at what failed and replay it
}

resource "google_pubsub_subscription" "push" {
  name                 = "contracts-changed-to-web"
  topic                = google_pubsub_topic.contracts_changed.id
  ack_deadline_seconds = 60

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.web.uri}${local.push_path}"
    oidc_token {
      service_account_email = google_service_account.push.email
      audience              = var.push_audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead.id
    max_delivery_attempts = 5
  }

  depends_on = [google_service_account_iam_member.pubsub_mints_tokens, google_pubsub_topic_iam_member.agent_dead_letters]
}

resource "google_pubsub_subscription_iam_member" "agent_acks_dead_letters" {
  subscription = google_pubsub_subscription.push.name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_agent
}

# ---- The web service -------------------------------------------------------------------------------------

locals {
  common_env = {
    ALLOWED_HOSTS = ".run.app"
    LOG_LEVEL     = "INFO"
  }
  secret_env = {
    DATABASE_URL = "alertas-database-url"
    SECRET_KEY   = "alertas-secret-key"
  }
}

resource "google_cloud_run_v2_service" "web" {
  name                = "secop-alertas"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0 # nothing runs, and nothing is billed, while nobody calls
      max_instance_count = 3
    }

    containers {
      name  = "web"
      image = var.image
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" } # pandas over a department fits in a few hundred MB
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.common_env, {
          REDIS_URL                   = "redis://localhost:6379/0"
          PUBSUB_PUSH_AUDIENCE        = var.push_audience
          PUBSUB_PUSH_SERVICE_ACCOUNT = google_service_account.push.email
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      startup_probe {
        http_get {
          path = "/readyz" # starts taking traffic once Postgres answers
        }
        period_seconds    = 5
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/healthz" # the process only; a database outage must not restart every instance
        }
        period_seconds = 30
      }
      depends_on = ["redis"]
    }

    # Redis beside Django: the cache and the throttling counters. It starts empty with every instance, which a
    # cache tolerates; Memorystore would share it across instances for about 36 USD a month.
    containers {
      name  = "redis"
      image = "docker.io/library/redis:8-alpine"
      resources {
        limits = { cpu = "1", memory = "256Mi" }
      }
      startup_probe {
        tcp_socket {
          port = 6379
        }
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [data.google_sql_database_instance.shared.connection_name]
      }
    }
  }

  # Terraform creates the service with var.image; after that, the CI pipeline (Jenkinsfile) rolls out new images.
  # Without this, every terraform apply would roll the service back to whatever image the tfvars name.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.read, google_secret_manager_secret_version.this]
}

# Public, read-mostly demo. Writes need an account; the push endpoint checks its own OIDC token.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- Ingestion: a job, started daily ---------------------------------------------------------------------

resource "google_cloud_run_v2_job" "ingest" {
  name                = "alertas-ingest"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.ingest.email
      max_retries     = 1
      timeout         = "1800s"
      containers {
        image = var.image
        # migrate, load, then send whatever is due (alerts whose backoff passed since the last push)
        command = ["sh", "-c", "python manage.py migrate --noinput && python manage.py ingest_secop --where \"$INGEST_WHERE\" && python manage.py deliver_alerts"]
        resources {
          limits = { cpu = "1", memory = "1Gi" }
        }
        dynamic "env" {
          for_each = merge(local.common_env, {
            EVENT_BUS    = "pubsub"
            PUBSUB_TOPIC = google_pubsub_topic.contracts_changed.id
            INGEST_WHERE = var.ingest_where
          })
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = local.secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.this[env.value].secret_id
                version = "latest"
              }
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [data.google_sql_database_instance.shared.connection_name]
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.read, google_secret_manager_secret_version.this]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs" {
  name     = google_cloud_run_v2_job.ingest.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "daily_ingest" {
  name      = "alertas-daily-ingest"
  region    = var.region
  schedule  = "0 6 * * *" # 06:00 Bogotá, after SECOP's nightly publication
  time_zone = "America/Bogota"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.ingest.name}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_cloud_run_v2_job_iam_member.scheduler_runs]
}
