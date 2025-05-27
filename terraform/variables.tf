variable "commit_sha" {
  description = "The commit SHA of the current build is used to tag the image"

}
variable "gcp_project_id" {
  default = "goldigger-460505"
}
variable "region" {
  default = "europe-west12"
}

variable "cloud_run_service_name" {
  default = "nextjs-api"
}

variable "artifact_service_account" {}

variable "mongodb_atlas_public_key" {}
variable "mongodb_atlas_private_key" {}
variable "atlas_org_id" {}
variable "database_url" {
  sensitive = true
}
variable "atlas_project" {}
variable "atlas_app_user" {}
variable "atlas_app_user_pwd" {}
variable "atlas_db_name" {}
