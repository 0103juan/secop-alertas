output "url" {
  description = "The service's address."
  value       = google_cloud_run_v2_service.web.uri
}

output "image_repository" {
  description = "Where to push the image: docker push <this>/web:<tag>"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "ingest_job" {
  description = "Run the ingestion now: gcloud run jobs execute <this> --region <region> --wait"
  value       = google_cloud_run_v2_job.ingest.name
}
