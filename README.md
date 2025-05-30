⚙️ Setup

# Clone and install
git clone https://github.com/iamruwainkelly/terraform-backend-demo.git
cd terraform-backend-demo
npm install

# Create .env file
cp .env.example .env


Edit .env with your secrets or leave mock values for demo:

PORT=3002
JWT_SECRET=demo_secret
AWS_ACCESS_KEY_ID=mock
AWS_SECRET_ACCESS_KEY=mock

🐳 Run Terraform via Docker

Make sure Docker is installed and Terraform CLI is inside the container image.

npm run dev


🧠 Author

RUWΔIN KΞLLY
Backend + AWS Infra + DevOps
📫 info@ruwainkelly.com
🔗 GitHub
