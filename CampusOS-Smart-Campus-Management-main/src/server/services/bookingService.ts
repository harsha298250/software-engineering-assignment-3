import {
  ApprovedSlotLock,
  COLLECTIONS,
  FirestoreBookingDoc,
  FirestoreFacilityDoc,
  FirestoreFacilityLockDoc,
  FirestoreUserDoc,
  getFacilityLockId,
  readCounterNextId,
  toIso,
} from '../firestore/store.ts';
import { SERVER_TIMESTAMP, getFirestoreClient } from '../firestore/restClient.ts';
import { DbUserRecord } from '../middleware/auth.ts';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors.ts';
import { BookingWithRelations, UserRole } from '../../shared/types.ts';

function slotsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function hydrateBooking(
  b: FirestoreBookingDoc,
  facilitiesMap: Map<number, FirestoreFacilityDoc>,
  usersById: Map<number, FirestoreUserDoc>
): BookingWithRelations {
  const facility = facilitiesMap.get(b.facilityId);
  const requester = usersById.get(b.userId);
  const approver = b.approvedBy ? usersById.get(b.approvedBy) : undefined;

  return {
    id: b.id,
    userId: b.userId,
    facilityId: b.facilityId,
    bookingDate: b.bookingDate,
    startTime: b.startTime,
    endTime: b.endTime,
    purpose: b.purpose,
    attendees: b.attendees,
    remarks: b.remarks ?? null,
    status: b.status,
    approvalRemarks: b.approvalRemarks ?? null,
    approvedBy: b.approvedBy ?? null,
    createdAt: toIso(b.createdAt),
    updatedAt: toIso(b.updatedAt),
    facilityName: facility?.name,
    facilityCode: facility?.code,
    facilityBuilding: facility?.building,
    facilityRoomNumber: facility?.roomNumber,
    facilityCapacity: facility?.capacity,
    requesterName: requester?.fullName ?? b.requesterName ?? undefined,
    requesterEmail: requester?.email,
    requesterRole: (requester?.role ?? b.requesterRole ?? undefined) as UserRole | undefined,
    approverName: approver?.fullName ?? b.approverName ?? null,
  };
}

async function loadRelationsMaps(actor: DbUserRecord, authToken?: string) {
  const client = getFirestoreClient();
  const [facRows, userRows] = await Promise.all([
    client.query<FirestoreFacilityDoc>(COLLECTIONS.facilities, undefined, authToken),
    actor.role === 'ADMIN'
      ? client.query<FirestoreUserDoc>(COLLECTIONS.users, undefined, authToken)
      : Promise.resolve([]),
  ]);

  const facilitiesMap = new Map<number, FirestoreFacilityDoc>();
  for (const r of facRows) {
    facilitiesMap.set(r.data.id, r.data);
  }

  const usersById = new Map<number, FirestoreUserDoc>();
  for (const r of userRows) {
    usersById.set(r.data.id, r.data);
  }
  if (!usersById.has(actor.id)) {
    usersById.set(actor.id, {
      ...actor,
    });
  }

  return { facilitiesMap, usersById };
}

export async function listBookings(
  actor: DbUserRecord,
  filters: {
    status?: string;
    facilityId?: number;
    date?: string;
    scope?: 'mine' | 'all';
  } = {},
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const where =
      actor.role !== 'ADMIN' || filters.scope === 'mine'
        ? [{ field: 'userUid', op: 'EQUAL' as const, value: actor.uid }]
        : undefined;

    const [bookingRows, { facilitiesMap, usersById }] = await Promise.all([
      client.query<FirestoreBookingDoc>(COLLECTIONS.bookings, { where }, authToken),
      loadRelationsMaps(actor, authToken),
    ]);

    let items = bookingRows.map((r) => r.data);

    if (filters.status && filters.status !== 'ALL') {
      items = items.filter((b) => b.status === filters.status);
    }
    if (filters.facilityId) {
      items = items.filter((b) => b.facilityId === filters.facilityId);
    }
    if (filters.date) {
      items = items.filter((b) => b.bookingDate === filters.date);
    }

    items.sort((a, b) => {
      const dateCmp = b.bookingDate.localeCompare(a.bookingDate);
      if (dateCmp !== 0) return dateCmp;
      return toIso(b.createdAt).localeCompare(toIso(a.createdAt));
    });

    return items.map((b) => hydrateBooking(b, facilitiesMap, usersById));
  } catch (error) {
    console.error('Failed to list bookings:', error);
    throw new Error('Unable to fetch room bookings.', { cause: error });
  }
}

export async function getBookingById(
  bookingId: number,
  actor: DbUserRecord,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const snap = await client.getDoc<FirestoreBookingDoc>(
      COLLECTIONS.bookings,
      String(bookingId),
      authToken
    );

    if (!snap.exists || !snap.data) {
      throw new NotFoundError('Booking request not found.');
    }

    const booking = snap.data;
    if (actor.role !== 'ADMIN' && booking.userId !== actor.id) {
      throw new ForbiddenError('You are not authorized to view this booking.');
    }

    const { facilitiesMap, usersById } = await loadRelationsMaps(actor, authToken);
    return hydrateBooking(booking, facilitiesMap, usersById);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to load booking detail:', error);
    throw new Error('Unable to load booking details.', { cause: error });
  }
}

export async function createBooking(
  actor: DbUserRecord,
  input: {
    facilityId: number;
    bookingDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
    attendees: number;
    remarks?: string | null;
  },
  authToken?: string
) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (input.bookingDate < todayStr) {
      throw new BadRequestError('Booking date cannot be in the past.');
    }

    if (input.startTime >= input.endTime) {
      throw new BadRequestError('Start time must be earlier than end time.');
    }

    const client = getFirestoreClient();
    const lockId = getFacilityLockId(input.facilityId, input.bookingDate);

    return await client.runTransaction(async (tx) => {
      const [
        facilitySnap,
        lockSnap,
        adminMarkers,
        bookingId,
        notifStartId,
        auditId,
      ] = await Promise.all([
        tx.getDoc<FirestoreFacilityDoc>(COLLECTIONS.facilities, String(input.facilityId)),
        tx.getDoc<FirestoreFacilityLockDoc>(COLLECTIONS.facilityLocks, lockId),
        tx.query<{ uid: string; userId?: number }>(COLLECTIONS.admins),
        readCounterNextId(tx, COLLECTIONS.bookings),
        readCounterNextId(tx, COLLECTIONS.notifications),
        readCounterNextId(tx, COLLECTIONS.auditLogs),
      ]);

      if (!facilitySnap.exists || !facilitySnap.data) {
        throw new NotFoundError('Selected facility does not exist.');
      }

      const facility = facilitySnap.data;

      if (facility.operationalStatus !== 'OPERATIONAL') {
        throw new BadRequestError(
          `Facility ${facility.name} is currently ${facility.operationalStatus.replace('_', ' ').toLowerCase()} and cannot be booked.`
        );
      }

      if (input.attendees > facility.capacity) {
        throw new BadRequestError(
          `Attendee count (${input.attendees}) exceeds room capacity (${facility.capacity} seats).`
        );
      }

      const lockSlots: ApprovedSlotLock[] =
        lockSnap.exists && lockSnap.data ? lockSnap.data.approvedSlots || [] : [];
      const conflictingLock = lockSlots.find((s) =>
        slotsOverlap(s.startTime, s.endTime, input.startTime, input.endTime)
      );
      if (conflictingLock) {
        throw new ConflictError(
          `Time conflict: ${facility.name} is already booked on ${input.bookingDate} from ${conflictingLock.startTime} to ${conflictingLock.endTime}.`
        );
      }

      const nowIso = new Date().toISOString();
      const bookingPayload = {
        id: bookingId,
        userId: actor.id,
        userUid: actor.uid,
        facilityId: input.facilityId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        purpose: input.purpose,
        attendees: input.attendees,
        remarks: input.remarks ?? null,
        status: 'PENDING',
        approvalRemarks: null,
        approvedBy: null,
        requesterName: actor.fullName,
        requesterRole: actor.role,
        approverName: null,
      };

      tx.set(COLLECTIONS.bookings, String(bookingId), {
        ...bookingPayload,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.bookings, { nextId: bookingId + 1 });

      let nextNotifId = notifStartId;
      tx.set(COLLECTIONS.notifications, String(nextNotifId++), {
        id: notifStartId,
        userId: actor.id,
        userUid: actor.uid,
        title: `Booking Submitted: ${facility.name}`,
        message: `Your request for ${input.bookingDate} (${input.startTime}–${input.endTime}) is pending administrator approval.`,
        type: 'BOOKING',
        isRead: false,
        createdAt: SERVER_TIMESTAMP,
      });

      for (const marker of adminMarkers) {
        const adminUid = marker.data.uid;
        const adminUserId = marker.data.userId;
        if (adminUid && adminUid !== actor.uid && adminUserId && adminUserId > 0) {
          const idForNotif = nextNotifId++;
          tx.set(COLLECTIONS.notifications, String(idForNotif), {
            id: idForNotif,
            userId: adminUserId,
            userUid: adminUid,
            title: `New Booking Request: ${facility.code}`,
            message: `${actor.fullName} requested ${facility.name} on ${input.bookingDate} (${input.startTime}–${input.endTime}).`,
            type: 'BOOKING',
            isRead: false,
            createdAt: SERVER_TIMESTAMP,
          });
        }
      }
      tx.set(COLLECTIONS.counters, COLLECTIONS.notifications, { nextId: nextNotifId });

      tx.set(COLLECTIONS.auditLogs, String(auditId), {
        id: auditId,
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'BOOKING_CREATED',
        entityType: 'BOOKING',
        entityId: bookingId,
        details: `Submitted booking for ${facility.code} on ${input.bookingDate} (${input.startTime}-${input.endTime}).`,
        timestamp: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.auditLogs, { nextId: auditId + 1 });

      return {
        ...bookingPayload,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }, authToken);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to create booking:', error);
    throw new Error('Unable to submit booking request.', { cause: error });
  }
}

export async function approveBooking(
  bookingId: number,
  adminUser: DbUserRecord,
  approvalRemarks?: string | null,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();

    return await client.runTransaction(async (tx) => {
      // 1. Read booking to locate deterministic facility & date lock
      const bookingSnap = await tx.getDoc<FirestoreBookingDoc>(
        COLLECTIONS.bookings,
        String(bookingId)
      );
      if (!bookingSnap.exists || !bookingSnap.data) {
        throw new NotFoundError('Booking request not found.');
      }

      const target = bookingSnap.data;
      if (target.status !== 'PENDING') {
        throw new ConflictError(
          `Booking #${bookingId} has already been ${target.status.toLowerCase()}.`
        );
      }

      const lockId = getFacilityLockId(target.facilityId, target.bookingDate);

      // 2. Read facility, lock document, existing approved bookings, and counters BEFORE writes
      const [facilitySnap, lockSnap, approvedRows, notifId, auditId] = await Promise.all([
        tx.getDoc<FirestoreFacilityDoc>(COLLECTIONS.facilities, String(target.facilityId)),
        tx.getDoc<FirestoreFacilityLockDoc>(COLLECTIONS.facilityLocks, lockId),
        tx.query<FirestoreBookingDoc>(COLLECTIONS.bookings, {
          where: [
            { field: 'facilityId', op: 'EQUAL', value: target.facilityId },
            { field: 'bookingDate', op: 'EQUAL', value: target.bookingDate },
            { field: 'status', op: 'EQUAL', value: 'APPROVED' },
          ],
        }),
        readCounterNextId(tx, COLLECTIONS.notifications),
        readCounterNextId(tx, COLLECTIONS.auditLogs),
      ]);

      if (!facilitySnap.exists || !facilitySnap.data) {
        throw new NotFoundError('Associated facility not found.');
      }

      const facility = facilitySnap.data;
      if (facility.operationalStatus !== 'OPERATIONAL') {
        throw new ConflictError(
          `Cannot approve booking because ${facility.name} is currently ${facility.operationalStatus.replace('_', ' ').toLowerCase()}.`
        );
      }

      // 3. Atomic overlap validation against deterministic facility lock AND approved booking docs
      const existingSlots: ApprovedSlotLock[] =
        lockSnap.exists && lockSnap.data ? lockSnap.data.approvedSlots || [] : [];

      const slotConflict = existingSlots.find(
        (slot) =>
          slot.bookingId !== target.id &&
          slotsOverlap(slot.startTime, slot.endTime, target.startTime, target.endTime)
      );
      if (slotConflict) {
        throw new ConflictError(
          `Conflict detected: ${facility.name} already has an approved booking (#${slotConflict.bookingId}) from ${slotConflict.startTime} to ${slotConflict.endTime} on ${target.bookingDate}.`
        );
      }

      for (const row of approvedRows) {
        const b = row.data;
        if (
          b.id !== target.id &&
          slotsOverlap(b.startTime, b.endTime, target.startTime, target.endTime)
        ) {
          throw new ConflictError(
            `Conflict detected: ${facility.name} already has an approved booking (#${b.id}) from ${b.startTime} to ${b.endTime} on ${target.bookingDate}.`
          );
        }
      }

      // 4. Write approval, lock slot, notification, and audit log atomically
      const remarksText = approvalRemarks?.trim() || 'Approved by campus administration.';
      const nowIso = new Date().toISOString();

      tx.update(COLLECTIONS.bookings, String(bookingId), {
        status: 'APPROVED',
        approvedBy: adminUser.id,
        approverName: adminUser.fullName,
        approvalRemarks: remarksText,
        updatedAt: SERVER_TIMESTAMP,
      });

      const nextSlots: ApprovedSlotLock[] = [
        ...existingSlots.filter((s) => s.bookingId !== target.id),
        {
          bookingId: target.id,
          startTime: target.startTime,
          endTime: target.endTime,
          purpose: target.purpose,
        },
      ];

      tx.set(COLLECTIONS.facilityLocks, lockId, {
        facilityId: target.facilityId,
        bookingDate: target.bookingDate,
        approvedSlots: nextSlots,
        updatedAt: SERVER_TIMESTAMP,
      });

      tx.set(COLLECTIONS.notifications, String(notifId), {
        id: notifId,
        userId: target.userId,
        userUid: target.userUid,
        title: `Booking Approved: ${facility.name}`,
        message: `Your reservation on ${target.bookingDate} (${target.startTime}–${target.endTime}) has been approved.`,
        type: 'BOOKING',
        isRead: false,
        createdAt: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.notifications, { nextId: notifId + 1 });

      tx.set(COLLECTIONS.auditLogs, String(auditId), {
        id: auditId,
        actorId: adminUser.id,
        actorUid: adminUser.uid,
        actorName: adminUser.fullName,
        action: 'BOOKING_APPROVED',
        entityType: 'BOOKING',
        entityId: bookingId,
        details: `Approved booking #${bookingId} for ${facility.code} on ${target.bookingDate} (${target.startTime}-${target.endTime}).`,
        timestamp: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.auditLogs, { nextId: auditId + 1 });

      return {
        ...target,
        status: 'APPROVED',
        approvedBy: adminUser.id,
        approverName: adminUser.fullName,
        approvalRemarks: remarksText,
        updatedAt: nowIso,
      };
    }, authToken);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to approve booking:', error);
    throw new Error('Unable to approve booking request.', { cause: error });
  }
}

export async function rejectBooking(
  bookingId: number,
  adminUser: DbUserRecord,
  approvalRemarks: string,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();

    return await client.runTransaction(async (tx) => {
      const bookingSnap = await tx.getDoc<FirestoreBookingDoc>(
        COLLECTIONS.bookings,
        String(bookingId)
      );
      if (!bookingSnap.exists || !bookingSnap.data) {
        throw new NotFoundError('Booking request not found.');
      }

      const target = bookingSnap.data;
      if (target.status !== 'PENDING') {
        throw new ConflictError(
          `Booking #${bookingId} cannot be rejected because it is already ${target.status.toLowerCase()}.`
        );
      }

      const [facilitySnap, notifId, auditId] = await Promise.all([
        tx.getDoc<FirestoreFacilityDoc>(COLLECTIONS.facilities, String(target.facilityId)),
        readCounterNextId(tx, COLLECTIONS.notifications),
        readCounterNextId(tx, COLLECTIONS.auditLogs),
      ]);

      const facility = facilitySnap.exists ? facilitySnap.data : null;
      const nowIso = new Date().toISOString();

      tx.update(COLLECTIONS.bookings, String(bookingId), {
        status: 'REJECTED',
        approvedBy: adminUser.id,
        approverName: adminUser.fullName,
        approvalRemarks,
        updatedAt: SERVER_TIMESTAMP,
      });

      tx.set(COLLECTIONS.notifications, String(notifId), {
        id: notifId,
        userId: target.userId,
        userUid: target.userUid,
        title: `Booking Rejected: ${facility?.name ?? 'Campus Facility'}`,
        message: `Your request for ${target.bookingDate} (${target.startTime}–${target.endTime}) was rejected: ${approvalRemarks}`,
        type: 'BOOKING',
        isRead: false,
        createdAt: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.notifications, { nextId: notifId + 1 });

      tx.set(COLLECTIONS.auditLogs, String(auditId), {
        id: auditId,
        actorId: adminUser.id,
        actorUid: adminUser.uid,
        actorName: adminUser.fullName,
        action: 'BOOKING_REJECTED',
        entityType: 'BOOKING',
        entityId: bookingId,
        details: `Rejected booking #${bookingId}: ${approvalRemarks}`,
        timestamp: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.auditLogs, { nextId: auditId + 1 });

      return {
        ...target,
        status: 'REJECTED',
        approvedBy: adminUser.id,
        approverName: adminUser.fullName,
        approvalRemarks,
        updatedAt: nowIso,
      };
    }, authToken);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to reject booking:', error);
    throw new Error('Unable to reject booking request.', { cause: error });
  }
}

export async function cancelBooking(
  bookingId: number,
  actor: DbUserRecord,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();

    return await client.runTransaction(async (tx) => {
      const bookingSnap = await tx.getDoc<FirestoreBookingDoc>(
        COLLECTIONS.bookings,
        String(bookingId)
      );
      if (!bookingSnap.exists || !bookingSnap.data) {
        throw new NotFoundError('Booking request not found.');
      }

      const target = bookingSnap.data;
      if (actor.role !== 'ADMIN' && target.userId !== actor.id) {
        throw new ForbiddenError('You can only cancel your own booking requests.');
      }

      if (!['PENDING', 'APPROVED'].includes(target.status)) {
        throw new BadRequestError(
          `Cannot cancel a booking with status ${target.status.toLowerCase()}.`
        );
      }

      const lockId = getFacilityLockId(target.facilityId, target.bookingDate);
      const [facilitySnap, lockSnap, notifId, auditId] = await Promise.all([
        tx.getDoc<FirestoreFacilityDoc>(COLLECTIONS.facilities, String(target.facilityId)),
        tx.getDoc<FirestoreFacilityLockDoc>(COLLECTIONS.facilityLocks, lockId),
        readCounterNextId(tx, COLLECTIONS.notifications),
        readCounterNextId(tx, COLLECTIONS.auditLogs),
      ]);

      const facility = facilitySnap.exists ? facilitySnap.data : null;
      const nowIso = new Date().toISOString();
      const nextRemarks =
        target.approvalRemarks ||
        `Cancelled by ${actor.role === 'ADMIN' && actor.id !== target.userId ? 'administrator' : 'requester'}.`;

      tx.update(COLLECTIONS.bookings, String(bookingId), {
        status: 'CANCELLED',
        approvalRemarks: nextRemarks,
        updatedAt: SERVER_TIMESTAMP,
      });

      if (lockSnap.exists && lockSnap.data) {
        const currentSlots = lockSnap.data.approvedSlots || [];
        const remainingSlots = currentSlots.filter((s) => s.bookingId !== target.id);
        if (remainingSlots.length < currentSlots.length) {
          tx.update(COLLECTIONS.facilityLocks, lockId, {
            approvedSlots: remainingSlots,
            lastCancelledBookingId: target.id,
            updatedAt: SERVER_TIMESTAMP,
          });
        }
      }

      tx.set(COLLECTIONS.notifications, String(notifId), {
        id: notifId,
        userId: target.userId,
        userUid: target.userUid,
        title: `Booking Cancelled: ${facility?.name ?? 'Campus Facility'}`,
        message: `Reservation for ${target.bookingDate} (${target.startTime}–${target.endTime}) has been cancelled.`,
        type: 'BOOKING',
        isRead: false,
        createdAt: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.notifications, { nextId: notifId + 1 });

      tx.set(COLLECTIONS.auditLogs, String(auditId), {
        id: auditId,
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'BOOKING_CANCELLED',
        entityType: 'BOOKING',
        entityId: bookingId,
        details: `Cancelled booking #${bookingId} for ${facility?.code ?? target.facilityId}.`,
        timestamp: SERVER_TIMESTAMP,
      });
      tx.set(COLLECTIONS.counters, COLLECTIONS.auditLogs, { nextId: auditId + 1 });

      return {
        ...target,
        status: 'CANCELLED',
        approvalRemarks: nextRemarks,
        updatedAt: nowIso,
      };
    }, authToken);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to cancel booking:', error);
    throw new Error('Unable to cancel booking.', { cause: error });
  }
}
