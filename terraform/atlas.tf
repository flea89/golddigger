
resource "mongodbatlas_project" "project" {
  name   = var.atlas_project
  org_id = var.atlas_org_id
}

resource "mongodbatlas_cluster" "cluster" {
  project_id            = mongodbatlas_project.project.id
  name                  = "free-cluster"
  provider_name         = "TENANT"
  backing_provider_name = "GCP"
  cluster_type          = "REPLICASET"
  provider_instance_size_name = "M0"
  provider_region_name = "WESTERN_EUROPE"
}

# 3. Allow any IP address (not for production)
resource "mongodbatlas_project_ip_access_list" "open_access" {
  project_id = mongodbatlas_project.project.id
  cidr_block = "0.0.0.0/0"
  comment = "Allow all IPs for development"
}

# 4. Create a database user
resource "mongodbatlas_database_user" "app_user" {
  username           = var.atlas_app_user
  password           = var.atlas_app_user_pwd  # 🔐 use Terraform variables in production
  project_id         = mongodbatlas_project.project.id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.atlas_db_name
  }

  scopes {
    name = mongodbatlas_cluster.cluster.name
    type = "CLUSTER"
  }
}

# FIXME: not the right url
output "mongo_uri" {
  value = "mongodb+srv://${mongodbatlas_database_user.app_user.username}:${mongodbatlas_database_user.app_user.password}@${mongodbatlas_cluster.cluster.connection_strings[0].standard_srv}/{var.atlas_db}"
  sensitive = true
}