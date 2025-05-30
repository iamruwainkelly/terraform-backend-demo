# Simple Terraform configuration for testing
provider "local" {
  # No configuration needed for local provider
}

resource "local_file" "test" {
  content  = "Hello from Terraform!"
  filename = "/tmp/terraform-test.txt"
}

output "file_path" {
  value = local_file.test.filename
}
