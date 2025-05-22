terraform {
  backend "gcs" {
    bucket  = "goldigger-460505-terraform"
    prefix  = "env/dev"  # organizes by folder path inside bucket
  }
}