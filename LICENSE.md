🛡️ License

MIT © 2025 iamruwainkelly


---

### 📁 `terraform-backend-demo` — **README.md**

> 🔥 Paste this directly into your `terraform-backend-demo/README.md`

```markdown
# Terraform Backend Demo API — RUWΔIN KΞLLY

Secure Node.js API to power real-time Terraform operations from a frontend interface. This backend was built to support live demos on my portfolio, with JWT authentication, secure `.tf` execution, and Docker-based job handling for real Terraform workflows.

---

## 🚀 Live Usage

This API powers my portfolio at: [https://iamruwainkelly.vercel.app/terraform-demo](https://iamruwainkelly.vercel.app/terraform-demo)

---

## 📦 Features

- 🔐 JWT-secured API endpoints
- 🛠️ Execute Terraform validate, plan, and apply via POST
- 📂 Track job status with `/jobs` endpoint
- 🐳 Docker-based Terraform execution for real `.tf` files
- 🧪 Mock fallback mode for demo if Docker is not available

---

## 🔧 Tech Stack

| Component         | Description                   |
|------------------|-------------------------------|
| Node.js + Express | API Framework                 |
| JWT               | Authentication Layer          |
| Terraform CLI     | Infrastructure as Code        |
| Docker            | Containerised execution (optional) |

---

## 📁 API Endpoints

| Method | Route                | Description                       |
|--------|----------------------|-----------------------------------|
| POST   | `/terraform/validate` | Validate `.tf` config             |
| POST   | `/terraform/plan`     | Execute and return plan           |
| GET    | `/terraform/jobs`     | List all jobs by user             |

---

## 📂 Project Structure

```bash
terraform-backend/
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── utils/
│   └── app.js
├── .env.example
├── Dockerfile
└── README.md















