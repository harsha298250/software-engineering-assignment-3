import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adminProvisionUserSchema,
  createBookingSchema,
  facilitySchema,
  loginSchema,
  registerProfileSchema,
  rejectBookingSchema,
} from '../server/validators.ts';
import { approveBooking, cancelBooking, createBooking } from '../server/services/bookingService.ts';
import { getOrCreateCampusUser } from '../server/middleware/auth.ts';
import { ConflictError, ForbiddenError, RoleMismatchError } from '../server/errors.ts';
import {
  InMemoryFirestoreClient,
  RestFirestoreClient,
  SERVER_TIMESTAMP,
  setFirestoreClientForTesting,
} from '../server/firestore/restClient.ts';
import {
  COLLECTIONS,
  FirestoreFacilityDoc,
  FirestoreRoleInviteDoc,
  FirestoreUserDoc,
  getFacilityLockId,
  getInviteDocId,
  serializeUser,
} from '../server/firestore/store.ts';

describe('Validation & Role Escalation Prevention', () => {
  it('rejects bookings where startTime is not earlier than endTime', () => {
    const res = createBookingSchema.safeParse({
      facilityId: 1,
      bookingDate: '2026-12-01',
      startTime: '14:00',
      endTime: '13:00',
      purpose: 'Invalid inverted time test',
      attendees: 10,
    });
    expect(res.success).toBe(false);
  });

  it('prevents public profile registration from self-assigning ADMIN or MAINTENANCE_STAFF', () => {
    const adminAttempt = registerProfileSchema.safeParse({
      fullName: 'Test User',
      department: 'Computer Science',
      requestedRole: 'ADMIN',
    });
    const staffAttempt = registerProfileSchema.safeParse({
      fullName: 'Test User',
      department: 'Computer Science',
      requestedRole: 'MAINTENANCE_STAFF',
    });
    expect(adminAttempt.success).toBe(false);
    expect(staffAttempt.success).toBe(false);

    const validFaculty = registerProfileSchema.safeParse({
      fullName: 'Dr. Jane Doe',
      department: 'Physics',
      requestedRole: 'FACULTY',
    });
    expect(validFaculty.success).toBe(true);
  });

  it('validates login portal expectedRole and admin provisioning inputs', () => {
    expect(loginSchema.safeParse({ expectedRole: 'MAINTENANCE_STAFF' }).success).toBe(true);
    expect(loginSchema.safeParse({ expectedRole: 'SUPERUSER' }).success).toBe(false);

    const validProvision = adminProvisionUserSchema.safeParse({
      fullName: 'Jordan Reyes',
      email: 'jordan.reyes@northbridge.edu',
      department: 'Facilities Engineering',
      role: 'MAINTENANCE_STAFF',
    });
    expect(validProvision.success).toBe(true);

    const invalidProvision = adminProvisionUserSchema.safeParse({
      fullName: 'A',
      email: 'not-an-email',
      department: 'IT',
      role: 'ADMIN',
    });
    expect(invalidProvision.success).toBe(false);
  });

  it('requires rejection remarks when rejecting a booking', () => {
    const empty = rejectBookingSchema.safeParse({ approvalRemarks: '' });
    expect(empty.success).toBe(false);
  });

  it('validates facility capacity and floor bounds', () => {
    const bad = facilitySchema.safeParse({
      code: 'FAC-999',
      name: 'Test Room',
      category: 'Classrooms',
      building: 'Test Hall',
      floor: 1,
      roomNumber: '999',
      capacity: 0,
      description: 'Description that is long enough',
    });
    expect(bad.success).toBe(false);
  });
});

describe('Live Cloud Firestore Security Rules Enforcement', () => {
  const restClient = new RestFirestoreClient();

  it('allows unauthenticated public reads on non-PII facilities and facility_locks', async () => {
    const [facilities, locks] = await Promise.all([
      restClient.query<FirestoreFacilityDoc>(COLLECTIONS.facilities, { limit: 1 }),
      restClient.query(COLLECTIONS.facilityLocks, { limit: 1 }),
    ]);
    expect(Array.isArray(facilities)).toBe(true);
    expect(Array.isArray(locks)).toBe(true);
  }, 15000);

  it('denies unauthenticated access to PII and operational collections via firestore.rules', async () => {
    await expect(restClient.query(COLLECTIONS.users, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(restClient.query(COLLECTIONS.bookings, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(
      restClient.query(COLLECTIONS.maintenanceRequests, { limit: 1 })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restClient.query(COLLECTIONS.notifications, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(restClient.query(COLLECTIONS.auditLogs, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(restClient.query(COLLECTIONS.admins, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(restClient.query(COLLECTIONS.roleInvites, { limit: 1 })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  }, 15000);
});

describe('Transactional Room Booking Concurrency & Capacity Enforcement', () => {
  let memoryClient: InMemoryFirestoreClient;
  let adminUserDoc: FirestoreUserDoc;
  let studentUserDoc: FirestoreUserDoc;
  let facilityDoc: FirestoreFacilityDoc;

  beforeEach(async () => {
    memoryClient = new InMemoryFirestoreClient();
    setFirestoreClientForTesting(memoryClient);

    const nowIso = new Date().toISOString();
    adminUserDoc = {
      id: 1,
      uid: 'test-admin-uid',
      fullName: 'Dr. Test Admin',
      email: 'admin@northbridge.edu',
      department: 'Campus Operations',
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    studentUserDoc = {
      id: 2,
      uid: 'test-student-uid',
      fullName: 'Student Tester',
      email: 'student@northbridge.edu',
      department: 'Computer Science',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    facilityDoc = {
      id: 1,
      code: 'SCI-101',
      name: 'Science Lecture Theater',
      category: 'Classrooms',
      building: 'Science Pavilion',
      floor: 1,
      roomNumber: '101',
      capacity: 40,
      description: 'Tiered lecture theater for science seminars and workshops.',
      amenities: ['Projector', 'Lecture Capture'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await memoryClient.commitBatch([
      {
        type: 'set',
        collection: COLLECTIONS.users,
        id: adminUserDoc.uid,
        data: { ...adminUserDoc, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
      },
      {
        type: 'set',
        collection: COLLECTIONS.admins,
        id: adminUserDoc.uid,
        data: { uid: adminUserDoc.uid, userId: adminUserDoc.id, grantedAt: SERVER_TIMESTAMP },
      },
      {
        type: 'set',
        collection: COLLECTIONS.users,
        id: studentUserDoc.uid,
        data: { ...studentUserDoc, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
      },
      {
        type: 'set',
        collection: COLLECTIONS.facilities,
        id: String(facilityDoc.id),
        data: { ...facilityDoc, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
      },
      {
        type: 'set',
        collection: COLLECTIONS.counters,
        id: COLLECTIONS.bookings,
        data: { nextId: 1 },
      },
      {
        type: 'set',
        collection: COLLECTIONS.counters,
        id: COLLECTIONS.notifications,
        data: { nextId: 1 },
      },
      {
        type: 'set',
        collection: COLLECTIONS.counters,
        id: COLLECTIONS.auditLogs,
        data: { nextId: 1 },
      },
    ]);
  });

  afterAll(() => {
    setFirestoreClientForTesting(new RestFirestoreClient());
  });

  it('rejects booking submissions that exceed facility seating capacity', async () => {
    const student = serializeUser(studentUserDoc);
    await expect(
      createBooking(student, {
        facilityId: facilityDoc.id,
        bookingDate: '2028-06-10',
        startTime: '09:00',
        endTime: '11:00',
        purpose: 'Oversized Assembly Test',
        attendees: 45,
      })
    ).rejects.toThrow(/exceeds room capacity/i);
  });

  it('allows at most one approval when two overlapping pending bookings are approved simultaneously', async () => {
    const admin = serializeUser(adminUserDoc);
    const student = serializeUser(studentUserDoc);
    const testDate = '2028-05-15';

    const [b1, b2] = await Promise.all([
      createBooking(student, {
        facilityId: facilityDoc.id,
        bookingDate: testDate,
        startTime: '10:00',
        endTime: '12:00',
        purpose: 'Concurrency Test Booking A',
        attendees: 15,
      }),
      createBooking(student, {
        facilityId: facilityDoc.id,
        bookingDate: testDate,
        startTime: '11:00',
        endTime: '13:00',
        purpose: 'Concurrency Test Booking B (Overlapping)',
        attendees: 12,
      }),
    ]);

    const results = await Promise.allSettled([
      approveBooking(b1.id, admin, 'Concurrent approval 1'),
      approveBooking(b2.id, admin, 'Concurrent approval 2'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const errorReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(errorReason).toBeInstanceOf(ConflictError);
    expect(errorReason.statusCode).toBe(409);

    const lockId = getFacilityLockId(facilityDoc.id, testDate);
    const lockSnap = await memoryClient.getDoc<{ approvedSlots: Array<{ bookingId: number }> }>(
      COLLECTIONS.facilityLocks,
      lockId
    );
    expect(lockSnap.exists).toBe(true);
    expect(lockSnap.data?.approvedSlots.length).toBe(1);
  });

  it('allows non-overlapping bookings on the same day and releases the lock upon cancellation', async () => {
    const admin = serializeUser(adminUserDoc);
    const student = serializeUser(studentUserDoc);
    const testDate = '2028-05-16';

    const b1 = await createBooking(student, {
      facilityId: facilityDoc.id,
      bookingDate: testDate,
      startTime: '08:00',
      endTime: '10:00',
      purpose: 'Morning Lecture Session',
      attendees: 20,
    });
    const b2 = await createBooking(student, {
      facilityId: facilityDoc.id,
      bookingDate: testDate,
      startTime: '10:00',
      endTime: '12:00',
      purpose: 'Late Morning Workshop',
      attendees: 20,
    });

    const approved1 = await approveBooking(b1.id, admin, 'Approved morning');
    const approved2 = await approveBooking(b2.id, admin, 'Approved adjacent slot');
    expect(approved1.status).toBe('APPROVED');
    expect(approved2.status).toBe('APPROVED');

    // Cancel b1 and confirm a new overlapping slot for 08:30-09:30 can now be approved
    await cancelBooking(b1.id, student);

    const b3 = await createBooking(student, {
      facilityId: facilityDoc.id,
      bookingDate: testDate,
      startTime: '08:30',
      endTime: '09:30',
      purpose: 'Reclaimed Morning Slot',
      attendees: 10,
    });
    const approved3 = await approveBooking(b3.id, admin, 'Approved after cancellation');
    expect(approved3.status).toBe('APPROVED');
  });
});

describe('Role-Based Login, Mismatch Blocking & Admin Provisioning Flow', () => {
  let memoryClient: InMemoryFirestoreClient;

  beforeEach(async () => {
    memoryClient = new InMemoryFirestoreClient();
    setFirestoreClientForTesting(memoryClient);

    const nowIso = new Date().toISOString();
    const existingStudent: FirestoreUserDoc = {
      id: 8,
      uid: 'existing-student-uid',
      fullName: 'Maya Patel',
      email: 'maya.patel@northbridge.edu',
      department: 'Computer Science',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await memoryClient.commitBatch([
      {
        type: 'set',
        collection: COLLECTIONS.config,
        id: 'bootstrap',
        data: { claimedByUid: 'bootstrap-admin-uid', claimedAt: SERVER_TIMESTAMP },
      },
      {
        type: 'set',
        collection: COLLECTIONS.counters,
        id: COLLECTIONS.users,
        data: { nextId: 9 },
      },
      {
        type: 'set',
        collection: COLLECTIONS.counters,
        id: COLLECTIONS.auditLogs,
        data: { nextId: 1 },
      },
      {
        type: 'set',
        collection: COLLECTIONS.users,
        id: existingStudent.uid,
        data: { ...existingStudent, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
      },
    ]);
  });

  afterAll(() => {
    setFirestoreClientForTesting(new RestFirestoreClient());
  });

  it('rejects sign-in with RoleMismatchError (403) when existing account role differs from selected portal tab', async () => {
    await expect(
      getOrCreateCampusUser({
        uid: 'existing-student-uid',
        email: 'maya.patel@northbridge.edu',
        fullName: 'Maya Patel',
        authToken: 'test-token',
        expectedRole: 'ADMIN',
      })
    ).rejects.toMatchObject({
      name: 'RoleMismatchError',
      statusCode: 403,
      actualRole: 'STUDENT',
      expectedRole: 'ADMIN',
    });

    const okUser = await getOrCreateCampusUser({
      uid: 'existing-student-uid',
      email: 'maya.patel@northbridge.edu',
      fullName: 'Maya Patel',
      authToken: 'test-token',
      expectedRole: 'STUDENT',
    });
    expect(okUser.role).toBe('STUDENT');
  });

  it('blocks uninvited public users from signing in via Maintenance Staff or Administrator portals', async () => {
    await expect(
      getOrCreateCampusUser({
        uid: 'uninvited-staff-uid',
        email: 'random.user@northbridge.edu',
        fullName: 'Random User',
        authToken: 'test-token',
        expectedRole: 'MAINTENANCE_STAFF',
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      getOrCreateCampusUser({
        uid: 'uninvited-admin-uid',
        email: 'random.user@northbridge.edu',
        fullName: 'Random User',
        authToken: 'test-token',
        expectedRole: 'ADMIN',
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const createdSnap = await memoryClient.getDoc<FirestoreUserDoc>(
      COLLECTIONS.users,
      'uninvited-staff-uid'
    );
    expect(createdSnap.exists).toBe(false);
  });

  it('allows new users to register via Student or Faculty portals cleanly', async () => {
    const facultyUser = await getOrCreateCampusUser({
      uid: 'new-faculty-uid',
      email: 'prof.lee@northbridge.edu',
      fullName: 'Prof. Daniel Lee',
      authToken: 'test-token',
      expectedRole: 'FACULTY',
    });

    expect(facultyUser.role).toBe('FACULTY');
    expect(facultyUser.profileCompleted).toBe(false);
  });

  it('enforces portal match and atomically claims pre-provisioned Maintenance Staff role invite on first login', async () => {
    const inviteEmail = 'jordan.reyes@northbridge.edu';
    const inviteId = getInviteDocId(inviteEmail);
    const nowIso = new Date().toISOString();

    const inviteDoc: FirestoreRoleInviteDoc = {
      id: inviteId,
      email: inviteEmail,
      fullName: 'Jordan Reyes',
      department: 'Facilities Engineering',
      role: 'MAINTENANCE_STAFF',
      status: 'PENDING',
      invitedBy: 1,
      invitedByName: 'Dr. Test Admin',
      claimedByUid: null,
      claimedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await memoryClient.set(
      COLLECTIONS.roleInvites,
      inviteId,
      { ...inviteDoc, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP }
    );

    // Selecting wrong portal tab must fail with RoleMismatchError without consuming the invite
    await expect(
      getOrCreateCampusUser({
        uid: 'staff-google-uid',
        email: inviteEmail,
        fullName: 'Jordan R.',
        authToken: 'test-token',
        expectedRole: 'STUDENT',
      })
    ).rejects.toBeInstanceOf(RoleMismatchError);

    const unconsumedInvite = await memoryClient.getDoc<FirestoreRoleInviteDoc>(
      COLLECTIONS.roleInvites,
      inviteId
    );
    expect(unconsumedInvite.data?.status).toBe('PENDING');

    // Selecting matching MAINTENANCE_STAFF portal tab claims invite and provisions account
    const staffUser = await getOrCreateCampusUser({
      uid: 'staff-google-uid',
      email: inviteEmail,
      fullName: 'Jordan R.',
      authToken: 'test-token',
      expectedRole: 'MAINTENANCE_STAFF',
    });

    expect(staffUser.role).toBe('MAINTENANCE_STAFF');
    expect(staffUser.fullName).toBe('Jordan Reyes');
    expect(staffUser.department).toBe('Facilities Engineering');
    expect(staffUser.profileCompleted).toBe(true);

    const claimedInvite = await memoryClient.getDoc<FirestoreRoleInviteDoc>(
      COLLECTIONS.roleInvites,
      inviteId
    );
    expect(claimedInvite.data?.status).toBe('CLAIMED');
    expect(claimedInvite.data?.claimedByUid).toBe('staff-google-uid');
  });
});

