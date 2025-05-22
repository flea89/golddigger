
resource "google_storage_bucket" "assets" {
  name          = "${var.gcp_project_id}-assets"
  location      = var.region
  force_destroy = true
}
