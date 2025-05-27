
resource "google_cloud_run_service" "nextjs_app" {
  name     = var.cloud_run_service_name
  location = var.region

  template {
    spec {
      containers {
        image = docker_registry_image.registry_push.name
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

  // Add a trigger. It should deploy not only when image changes, but also when the
  // env variables change.
  # depends_on = [docker_image.nextjs_app]
}


resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.nextjs_app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
