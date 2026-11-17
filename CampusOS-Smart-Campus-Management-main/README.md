# Smart Campus — Facility Booking & Maintenance Management Platform

A full-stack university facility booking, concurrency-safe room scheduling, and campus maintenance management platform built with React, TypeScript, Tailwind CSS, Express.js, Cloud Firestore, and Firebase Authentication.

---

## Key Capabilities

- **Role-Based Access Control (RBAC)**: Enforced server-side and in `firestore.rules` across `STUDENT`, `FACULTY`, `MAINTENANCE_STAFF`, and `ADMIN` roles.
- **Google Sign-In & Profile Registration**: Firebase Authentication (`signInWithPopup`) with server-side ID token verification (`firebase-admin`) and Firestore user synchronization (`/users/{uid}` and `/admins/{uid}`). Public registration can never self-assign `ADMIN` or `MAINTENANCE_STAFF`.
- **Concurrency-Safe Room Booking Engine**: All bookings start as `PENDING` and require Administrator approval. Approval runs inside a **Cloud Firestore transaction** (`adminDb.runTransaction`) with deterministic per-facility-per-date lock documents (`/facility_locks/{facilityId}_{bookingDate}`) and returns **HTTP 409 Conflict** on overlapping time slots.
- **Maintenance Dispatch & Resolution**: Categorized and prioritized issue reporting (`OPEN` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`) with technician assignment and mandatory resolution remarks.
- **In-App Notifications & Audit Logs**: Firestore-persisted alerts for bookings and maintenance updates plus immutable audit trails (`/audit_logs`).
- **Analytics & CSV Reporting**: Recharts visualizations and downloadable CSV exports for bookings and maintenance datasets.

---

## Cloud Firestore vs. PostgreSQL Architecture Note (University Assignment)

This application runs in Google AI Studio using **Cloud Firestore** (NoSQL document database) and **Firebase Authentication** rather than a live PostgreSQL server:

- **PostgreSQL Equivalent**: Instead of relational tables, foreign keys, SQL `JOIN`s, and `SELECT ... FOR UPDATE` row locks (`src/db/schema.ts` is retained as reference documentation for SQL export), the live runtime stores normalized documents in Cloud Firestore collections (`/users`, `/admins`, `/facilities`, `/bookings`, `/facility_locks`, `/maintenance_requests`, `/notifications`, `/audit_logs`, `/counters`).
- **Concurrency Handling**: PostgreSQL `SELECT ... FOR UPDATE` row locking is replaced by **Cloud Firestore Optimistic Concurrency Transactions** (`adminDb.runTransaction`) over deterministic lock documents (`/facility_locks/{facilityId}_{bookingDate}`), guaranteeing at most one overlapping booking can be approved concurrently.
- **Security Rules & Indexes**: Access boundaries are codified in `firestore.rules` (enforcing verified tokens, owner checks, schema keys/bounds, and role restrictions) and composite query indexes are declared in `firestore.indexes.json`.

---

## Project Structure

- `server.ts` — Express server entry point (mounts Vite middleware in dev and serves `dist/` in production on port `3000`).
- `src/server/` — Express REST API routes, Zod validators, auth/RBAC middleware, Firestore store/seed helpers (`src/server/firestore/`), and domain services (`facilityService`, `bookingService`, `maintenanceService`, `dashboardService`).
- `src/lib/firebase.ts` & `src/lib/firebase-admin.ts` — Client and Admin Firebase SDK setup targeting the configured named Firestore database (`firebase-applet-config.json`).
- `firestore.rules` & `firestore.indexes.json` — Deployed Firestore security rules and composite indexes.
- `firebase-blueprint.json` — Data model intermediate representation (IR) for all Firestore collections.
- `src/pages/` & `src/components/` — 17 React Router pages, responsive sidebar/drawer layout, Recharts dashboards, and Warm Ivory / Midnight Navy theme toggle.
- `src/tests/` — Automated Zod validation, Cloud Firestore transactional concurrency, and security-rules policy tests (`vitest`).

---

## Local Development & Verification

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Seed Cloud Firestore (optional; also auto-seeds idempotently on first API access)**:
   ```bash
   npm run seed
   ```
3. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.
4. **Run automated tests & security rules lint**:
   ```bash
   npm test
   npx eslint firestore.rules
   ```

---

## Authentication & Seeded Demonstration Data

- **Google Sign-In**: Users authenticate via Google Sign-In. The first non-seeded account to sign in (or an email matching `INITIAL_ADMIN_EMAIL`) is initialized as `ADMIN` and granted an `/admins/{uid}` marker so an evaluator can immediately manage users, approve bookings, and assign technicians. All subsequent public sign-ins default to `STUDENT` (and may select `STUDENT` or `FACULTY` during profile completion).
- **Seeded Records**:
  - 7 campus users across `ADMIN`, `FACULTY`, `STUDENT`, and `MAINTENANCE_STAFF`.
  - 14 campus facilities across all 8 facility categories.
  - 13 sample bookings across `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, and `COMPLETED`.
  - 8 sample maintenance tickets across `OPEN`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`.
 
  - ## Room Booking Workflow

The CampusOS platform allows students and faculty
to request campus facility reservations.

1. Users select a facility and preferred time slot.
2. The system validates the booking request.
3. Administrators review pending requests.
4. Approved bookings are recorded in the database.
5. Users can track reservation status through
   their dashboard.
