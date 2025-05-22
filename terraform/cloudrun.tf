
resource "google_cloud_run_service" "nextjs_app" {
  name     = var.cloud_run_service_name
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.gcp_project_id}/nextjs"
        ports {
          container_port = 8080
        }
        env {
          name  = "DATABASE_URL"
          value = var.database_url
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}


resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.nextjs_app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}