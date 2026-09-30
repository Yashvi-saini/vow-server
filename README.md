# VOW Server (Backend)

Backend service for the **VOW** virtual office and collaborative workspace platform. Built with **Node.js**, **Express**, **TypeScript**, **MongoDB**, **Redis**, and **AWS S3**, featuring real-time messaging, map presence, and WebRTC video chat signaling.

---

## Tech Stack

- **Runtime & Language**: Node.js & TypeScript
- **Framework**: Express.js
- **Database**: MongoDB Atlas (via Mongoose)
- **Cache & Pub/Sub**: Redis (via Upstash / ioredis)
- **Object Storage**: AWS S3 (files, attachments & profile avatars)
- **Real-Time Communication**: Socket.IO & WebSocket (WebRTC SFU signaling)
- **Mailing**: Nodemailer (Gmail SMTP for verification OTPs)
- **API Documentation**: Swagger / OpenAPI 3.0 (`/api-docs`)
- **Hosting & Infrastructure**: AWS EC2 (Ubuntu), Nginx Reverse Proxy, Let's Encrypt SSL, PM2
- **CI/CD**: GitHub Actions (auto-deploy on push to `main`)

---

##  Getting Started (Local Development)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)

### 2. Installation
```bash
git clone https://github.com/Yashvi-saini/vow-server.git
cd vow-server
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Key environment variables:
```env
PORT=5000
NODE_ENV=development
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000

MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/vow?retryWrites=true&w=majority
REDIS_URL=rediss://default:<token>@<host>.upstash.io:6379
USE_REDIS=true

AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

EMAIL=your-email@gmail.com
PASS=your-google-app-password

JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
ACCESS_TOKEN_SECRET=your_access_token_secret
RESET_PASSWORD_TOKEN_SECRET=your_reset_password_secret
WORKSPACE_JWT_SECRET=your_workspace_jwt_secret
```

### 4. Running the Server
```bash
# Start in development mode with hot-reload
npm run dev

# Build TypeScript to dist/
npm run build

# Start production build
npm start
```

---

##  API Documentation & Health Check

- **Health Check**: `GET /health`
- **Interactive Swagger Docs**: `GET /api-docs/`

---

##  Production Deployment

- **Live URL**: `https://vow-api.duckdns.org`
- **Hosted on**: AWS EC2 instance running Ubuntu Server
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx with Let's Encrypt SSL Certificate
- **Auto-Deployment**: Pushing to the `main` branch automatically triggers GitHub Actions to pull, build, and restart the service on EC2.
