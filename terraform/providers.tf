
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.14"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "3.5.0"
    }
  }

  required_version = ">= 1.3.0"
}

provider "google" {
  project = var.gcp_project_id
  region  = var.region
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}

data "google_service_account_access_token" "repo" {
  target_service_account = var.artifact_service_account
  scopes                 = ["cloud-platform"]
}


provider "docker" {
  host = "unix:///var/run/docker.sock"


  #  Interestingly in CI, even if we're authenticating with the same service account
  #  gcloud iam service-accounts add-iam-policy-binding github-deployer@goldigger-460505.iam.gserviceaccount.com \
  # --member="serviceAccount:github-deployer@goldigger-460505.iam.gserviceaccount.com" \
  # --role="roles/iam.serviceAccountUser"
  #
  registry_auth {
    address  = "${var.region}-docker.pkg.dev"
    username = "oauth2accesstoken"
    password = data.google_service_account_access_token.repo.access_token
  }
}
