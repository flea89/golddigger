# 🧱 Golddigger App

This is a modern **Next.js app** using the **App Router** (13+/14), structured for scalability, full-stack features, and Cloud Run deployment.

---

## 🛠 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Dev Server
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
npm start
```

---

## 🐳 Deploy to Cloud Run (with Docker)
Deployments are handled by CI/CD but if you need to deploy locally you can:

1. Build and push the image:
```bash
docker build -t gcr.io/goldigger-460505/nextjs .
docker push gcr.io/goldigger-460505/nextjs
```

2. Deploy:
```bash
gcloud run deploy nextjs-app \
  --image gcr.io/YOUR_PROJECT_ID/nextjs-app \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated
```

---

## ⚙️ Environment Variables

Create a `.env.local` contains local variables.
