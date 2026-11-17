# Security Specification — CampusOS Smart Campus Firestore Rules

## 1. Data Invariants

1. **Identity Integrity**: Every user document in `/users/{userId}` is strictly keyed by the authenticated Firebase `uid` (`userId == request.auth.uid`), and no non-admin user may set or elevate `role` to `ADMIN` or `MAINTENANCE_STAFF` or alter `accountStatus`.
2. **PII Protection**: `/users/{userId}` documents contain institutional email addresses and are readable only by the document owner (`request.auth.uid == userId`) or a verified Administrator (`isAdmin()`). Blanket `list` queries on `/users` are denied to non-admins.
3. **Facility Governance**: Facilities (`/facilities/{facilityId}`) may be read by authenticated verified users, but created, updated, or deleted exclusively by Administrators (`isAdmin()`).
4. **Booking Ownership & Terminal Locking**: Bookings (`/bookings/{bookingId}`) must belong to the creator (`userUid == request.auth.uid`), reference an existing facility (`exists(/databases/$(database)/documents/facilities/...)`), start with `status == 'PENDING'`, and cannot be approved/rejected by non-admins or modified once in a terminal state (`REJECTED`, `CANCELLED`, `COMPLETED`) unless overridden by `isAdmin()`.
5. **Concurrency Lock Isolation**: `/facility_locks/{lockId}` is governed exclusively via server-side Firestore transactions (`firebase-admin`) and denied for direct client SDK writes.
6. **Maintenance Access & Tiered Updates**: Maintenance tickets (`/maintenance_requests/{requestId}`) are readable only by the reporter (`reporterUid == request.auth.uid`), the assigned technician (`assigneeUid == request.auth.uid`), or `isAdmin()`. Technicians may only transition `status` and `resolutionRemarks` on tickets assigned to them; only Admins may assign technicians or close tickets.
7. **Notification Ownership**: Notifications (`/notifications/{notificationId}`) are readable and markable as `isRead: true` exclusively by the owning `userUid == request.auth.uid` (or `isAdmin()`).
8. **Immutable Audit Trail & Counters**: `/audit_logs/{logId}` and `/counters/{counterId}` are server-managed via Admin SDK; client SDK writes and non-admin reads are denied.
9. **Server Timestamp Enforcement**: All client-permitted writes must match `request.time` on `createdAt`/`updatedAt` and pass strict `keys().hasAll(...)` / `keys().hasOnly(...)` schema validation.

---

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Target Collection | Attack Vector | Expected Result |
|---|-------------------|---------------|-----------------|
| 1 | `/users/{uid}` | **Privilege Escalation on Create**: Student creates profile with `role: "ADMIN"` | `PERMISSION_DENIED` |
| 2 | `/users/{uid}` | **Shadow Field Injection**: User creates profile with extra `isVerifiedAdmin: true` ghost key | `PERMISSION_DENIED` |
| 3 | `/users/{otherUid}` | **PII Blanket / Cross-User Read**: Student reads another user's `/users/{otherUid}` profile | `PERMISSION_DENIED` |
| 4 | `/users/{uid}` | **Unverified Email Spoofing**: Request with `email_verified: false` tries to write | `PERMISSION_DENIED` |
| 5 | `/facilities/{id}` | **Unauthorized Facility Creation**: Faculty or Student tries to create a facility | `PERMISSION_DENIED` |
| 6 | `/bookings/{id}` | **Status Bypass on Create**: Student creates a booking directly with `status: "APPROVED"` | `PERMISSION_DENIED` |
| 7 | `/bookings/{id}` | **Identity Spoofing**: User creates a booking with `userUid` set to another user's UID | `PERMISSION_DENIED` |
| 8 | `/bookings/{id}` | **Orphaned Facility Reference**: User creates a booking referencing non-existent `facilityId: 99999` | `PERMISSION_DENIED` |
| 9 | `/bookings/{id}` | **Terminal State Mutation**: User tries to re-open or alter a `REJECTED` or `CANCELLED` booking | `PERMISSION_DENIED` |
| 10 | `/maintenance_requests/{id}` | **Unauthorized Staff Assignment**: Non-admin user updates `assignedTo` on a maintenance ticket | `PERMISSION_DENIED` |
| 11 | `/notifications/{id}` | **Cross-User Notification Read/Update**: User tries to read or mark another user's notification | `PERMISSION_DENIED` |
| 12 | `/audit_logs/{id}` | **Audit Tampering / Poisoned 1.5KB ID**: User tries to write to `/audit_logs` or inject oversized ID | `PERMISSION_DENIED` |
