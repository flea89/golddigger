## Goldigger
Set of tools to make golden testing easier.


## Infrastructure
The infrastructure is managed with Terraform

In order to authenticate a terraform account need to create a service account and provide access to Artifact registry. The identity running Terraform should be able to impersonate that service account.

This could be automated by terraform but it's not implemented yet.
TODO:
//
consider adding
resource "google_service_account" "service_account" {
  account_id   = "service-account-id"
  display_name = "Service Account"
}
