# CampusOS — Docker Compose & GitHub Codespaces Deployment Guide

## 1. Repository Architecture Overview

CampusOS is a **combined full-stack TypeScript application** running inside a single Node.js container (`app`), backed by **externally managed Firebase services** (no local PostgreSQL container is used at runtime):

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS 4 (`npm run build` outputs static assets to `dist/`).
- **Backend & Server Entry Point**: Express 4 (`server.ts`, compiled for container runtime to `dist-server/server.mjs`), binding `0.0.0.0:${PORT:-3000}`. It serves `/api/*` endpoints and the compiled SPA from `dist/`.
- **Package Manager & Reproducible Installs**: `bun.lock` is the repository lockfile (`bun install --frozen-lockfile` in multi-stage Docker builds, executing on `node:22-alpine`).
- **Database & Authentication**: Externally managed **Firebase Authentication (Google Sign-In)** and **Cloud Firestore**.
- **Secret Separation**:
  - `.dockerignore` and `.gitignore` exclude `.env`, `firebase-applet-config.json`, `*.pem`, `*.key`, and service-account JSON files from both Docker image layers and Git commits.
  - All Firebase configuration and optional server credentials are supplied at **container runtime** via `.env`.
  - In production, `server.ts` injects only the public Firebase Web SDK configuration (`apiKey`, `authDomain`, `projectId`, `firestoreDatabaseId`, `storageBucket`, `messagingSenderId`, `appId`) into `index.html` at startup—never private keys or service-account credentials.

---

## 2. Prerequisites in GitHub Codespaces

1. Open your repository in **GitHub Codespaces** (Docker Engine and Docker Compose v2 are preinstalled in standard Codespaces images).
2. Verify Docker and Compose are available:
   ```bash
   docker --version
   docker compose version
   ```
3. Have a Firebase project ready with:
   - **Firebase Authentication → Sign-in method → Google** enabled.
   - **Cloud Firestore** created and `firestore.rules` + `firestore.indexes.json` deployed.

---

## 3. Securely Configuring Secrets & Firebase Environment Variables

1. Create your runtime `.env` file from the template (`.env` is already gitignored and dockerignored):
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your Firebase project values from **Firebase Console → Project Settings → Your Apps (Web app)**:
   - `FIREBASE_PROJECT_ID` & `VITE_FIREBASE_PROJECT_ID`
   - `FIREBASE_DATABASE_ID` & `VITE_FIREBASE_DATABASE_ID` (use `(default)` unless using a named Firestore database)
   - `FIREBASE_API_KEY` & `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `INITIAL_ADMIN_EMAIL` (optional email that receives initial `ADMIN` access on first Google Sign-In)
3. **Codespaces URL Configuration**:
   - Once Codespaces assigns your forwarded URL (for example `https://solid-space-xyz-3000.app.github.dev`), update `APP_URL` and `CORS_ORIGIN` in `.env` to match it (or keep `http://localhost:3000` when testing via local port tunnel).
4. **Optional Service Account Credentials (Server-Only)**:
   - Leave `FIREBASE_SERVICE_ACCOUNT_JSON` blank for standard ID token verification using Google public certificates, **or** set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env` (or Codespaces Repository/User Secrets), **or** mount a read-only file outside the repo using `GOOGLE_APPLICATION_CREDENTIALS`.
   - **Never** copy service-account JSON files into the repository directory or build them into the Docker image.

---

## 4. Building & Running with Docker Compose

1. Build the multi-stage container image (zero secrets are embedded in image layers):
   ```bash
   docker compose build
   ```
2. Start the application container in the background:
   ```bash
   docker compose up -d
   ```

---

## 5. Validating Containers & Viewing Logs

1. Check container status and healthcheck state (`healthy`):
   ```bash
   docker compose ps
   ```
2. Stream live application logs:
   ```bash
   docker compose logs -f app
   ```
   You should see:
   ```text
   Smart Campus server running on http://0.0.0.0:3000
   ```
3. Verify the local healthcheck and public overview endpoints inside Codespaces:
   ```bash
   curl -i http://localhost:3000/api/health
   curl -i http://localhost:3000/api/public/overview
   ```
   A healthy response returns HTTP `200` with `{"status":"ok","database":"firestore",...}`.
4. Confirm no secrets or local config files were baked into the built image:
   ```bash
   docker compose exec app ls -la /app
   ```
   Confirm `.env`, `firebase-applet-config.json`, and any `*.json` key files are absent inside `/app`.

---

## 6. Testing Through GitHub Codespaces Port Forwarding

1. In VS Code / GitHub Codespaces, open the **Ports** tab in the bottom panel.
2. Confirm port **3000** is listed and forwarded.
3. Click the forwarded **Local Address / Globe icon** (e.g., `https://<codespace-name>-3000.app.github.dev`) to open CampusOS in your browser.
4. **Authorize the Codespaces Domain in Firebase Authentication**:
   - Google Sign-In (`signInWithPopup`) will reject unrecognized hostnames with `auth/unauthorized-domain`.
   - In **Firebase Console → Authentication → Settings → Authorized domains**, click **Add domain** and add your forwarded Codespaces hostname (e.g., `<codespace-name>-3000.app.github.dev`, or your workspace domain).
5. Test the full flow in the browser:
   - Public Landing Page `/` loads live facility overview from Cloud Firestore.
   - Navigate to `/login`, select a role portal tab (`Student`, `Faculty`, `Maintenance Staff`, or `Administrator`), and verify Google Sign-In + role enforcement.

---

## 7. Rebuilding & Stopping After Code Changes

- **Rebuild and restart after editing code or dependencies**:
  ```bash
  docker compose up -d --build
  ```
- **Restart after editing only `.env` (no rebuild required because Firebase config is read at runtime)**:
  ```bash
  docker compose up -d --force-recreate
  ```
- **Stop and remove the running container**:
  ```bash
  docker compose down
  ```
