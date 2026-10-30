variable "project_id" {
  description = "An existing project with billing; the demo shares its Cloud SQL instance."
  type        = string
}

variable "region" {
  description = "Region of every resource. Must be the Cloud SQL instance's region."
  type        = string
  default     = "us-central1"
}

variable "sql_instance" {
  description = "Name of the existing Cloud SQL for PostgreSQL instance to create the database on."
  type        = string
}

variable "image" {
  description = "The application image, pushed to the Artifact Registry repository this creates, by digest."
  type        = string
}

variable "push_audience" {
  description = "Audience of the OIDC token Pub/Sub attaches to each push; the service rejects any other."
  type        = string
  default     = "secop-alertas-push"
}

variable "ingest_where" {
  description = "SoQL filter for the slice of SECOP II the daily job keeps up to date."
  type        = string
  default     = "departamento='Cauca' AND fecha_de_firma >= '2025-01-01'"
}
