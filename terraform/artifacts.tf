resource "google_artifact_registry_repository" "gcloud_docker_images" {
  location      = var.region
  repository_id = "gcloud-images"
  description   = "A respository for gcloud images"
  format        = "DOCKER"
}

locals {
  image_name = "${var.region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.gcloud_docker_images.repository_id}/nextjs:${var.commit_sha}"
}
resource "docker_image" "nextjs_app" {
    name = local.image_name
    build {
        context    = "../web/"
        dockerfile = "../web/Dockerfile"
        platform = "linux/amd64"
    }

    # TODO:
    # Look into a better way to handle this.
    triggers = {
      always_run = var.commit_sha
    }

    depends_on = [ google_artifact_registry_repository.gcloud_docker_images ]
}

resource "docker_registry_image" "registry_push" {
  name = local.image_name
  depends_on = [ docker_image.nextjs_app ]
  # TODO:
  # Look into a better way to handle this.
  triggers = {
    always_run = var.commit_sha
  }
}
