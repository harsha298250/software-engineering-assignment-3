import {
  COLLECTIONS,
  FirestoreBookingDoc,
  FirestoreFacilityDoc,
  FirestoreFacilityLockDoc,
  allocateNextId,
  createAuditLog,
  getFacilityLockId,
  serializeFacility,
} from '../firestore/store.ts';
import { SERVER_TIMESTAMP, getFirestoreClient } from '../firestore/restClient.ts';
import { AppError, ConflictError, NotFoundError } from '../errors.ts';
import { DbUserRecord } from '../middleware/auth.ts';
import { FacilityCategory, OperationalStatus } from '../../shared/types.ts';

export interface FacilityFilters {
  search?: string;
  category?: string;
  building?: string;
  minCapacity?: number;
  status?: string;
}

export async function listFacilities(
  filters: FacilityFilters = {},
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const rows = await client.query<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      undefined,
      authToken
    );

    let list = rows.map((r) => serializeFacility(r.data));

    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.code.toLowerCase().includes(q) ||
          f.building.toLowerCase().includes(q) ||
          f.roomNumber.toLowerCase().includes(q)
      );
    }

    if (filters.category && filters.category !== 'ALL') {
      list = list.filter((f) => f.category === filters.category);
    }

    if (filters.building && filters.building !== 'ALL') {
      list = list.filter((f) => f.building === filters.building);
    }

    if (filters.minCapacity && filters.minCapacity > 0) {
      list = list.filter((f) => f.capacity >= filters.minCapacity!);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter((f) => f.operationalStatus === filters.status);
    }

    list.sort((a, b) => {
      const bCmp = a.building.localeCompare(b.building);
      return bCmp !== 0 ? bCmp : a.code.localeCompare(b.code);
    });

    return list;
  } catch (error) {
    console.error('Failed to list facilities:', error);
    throw new Error('Unable to load campus facilities.', { cause: error });
  }
}

export async function getFacilityWithSlots(
  facilityId: number,
  date?: string,
  actor?: DbUserRecord,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const facSnap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(facilityId),
      authToken
    );

    if (!facSnap.exists || !facSnap.data) {
      throw new NotFoundError('Facility not found.');
    }

    const facility = serializeFacility(facSnap.data);
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let bookedSlots: Array<{
      id: number;
      bookingDate: string;
      startTime: string;
      endTime: string;
      purpose: string;
      status: string;
    }> = [];

    if (actor?.role === 'ADMIN') {
      const bookingRows = await client.query<FirestoreBookingDoc>(
        COLLECTIONS.bookings,
        {
          where: [
            { field: 'facilityId', op: 'EQUAL', value: facilityId },
            { field: 'bookingDate', op: 'EQUAL', value: targetDate },
          ],
        },
        authToken
      );

      bookedSlots = bookingRows
        .map((r) => r.data)
        .filter((b) => b.status === 'APPROVED' || b.status === 'PENDING')
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((b) => ({
          id: b.id,
          bookingDate: b.bookingDate,
          startTime: b.startTime,
          endTime: b.endTime,
          purpose: b.purpose,
          status: b.status,
        }));
    } else {
      const [lockSnap, myPendingRows] = await Promise.all([
        client.getDoc<FirestoreFacilityLockDoc>(
          COLLECTIONS.facilityLocks,
          getFacilityLockId(facilityId, targetDate),
          authToken
        ),
        actor
          ? client.query<FirestoreBookingDoc>(
              COLLECTIONS.bookings,
              {
                where: [
                  { field: 'userUid', op: 'EQUAL', value: actor.uid },
                  { field: 'facilityId', op: 'EQUAL', value: facilityId },
                  { field: 'bookingDate', op: 'EQUAL', value: targetDate },
                ],
              },
              authToken
            )
          : Promise.resolve([]),
      ]);

      const approved = (lockSnap.exists && lockSnap.data ? lockSnap.data.approvedSlots : []).map(
        (slot) => ({
          id: slot.bookingId,
          bookingDate: targetDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          purpose: slot.purpose || 'Reserved Campus Event',
          status: 'APPROVED',
        })
      );

      const myPending = myPendingRows
        .map((r) => r.data)
        .filter((b) => b.status === 'PENDING')
        .map((b) => ({
          id: b.id,
          bookingDate: b.bookingDate,
          startTime: b.startTime,
          endTime: b.endTime,
          purpose: b.purpose,
          status: b.status,
        }));

      bookedSlots = [...approved, ...myPending].sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
    }

    return {
      facility,
      date: targetDate,
      bookedSlots,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to get facility detail:', error);
    throw new Error('Unable to load facility details.', { cause: error });
  }
}

export async function createFacility(
  actor: DbUserRecord,
  input: {
    code: string;
    name: string;
    category: string;
    building: string;
    floor: number;
    roomNumber: string;
    capacity: number;
    description: string;
    amenities: string[];
    imageKey: string;
    operationalStatus: string;
  },
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const upperCode = input.code.toUpperCase();

    const dupRows = await client.query<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      { where: [{ field: 'code', op: 'EQUAL', value: upperCode }], limit: 1 },
      authToken
    );

    if (dupRows.length > 0) {
      throw new ConflictError(`Facility code ${upperCode} already exists.`);
    }

    const id = await allocateNextId(COLLECTIONS.facilities, authToken);
    const nowIso = new Date().toISOString();
    const docData: FirestoreFacilityDoc = {
      id,
      code: upperCode,
      name: input.name,
      category: input.category as FacilityCategory,
      building: input.building,
      floor: input.floor,
      roomNumber: input.roomNumber,
      capacity: input.capacity,
      description: input.description,
      amenities: input.amenities,
      imageKey: input.imageKey,
      operationalStatus: input.operationalStatus as OperationalStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await client.set(
      COLLECTIONS.facilities,
      String(id),
      {
        ...docData,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
      authToken
    );

    await createAuditLog(
      {
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'FACILITY_CREATED',
        entityType: 'FACILITY',
        entityId: id,
        details: `Created facility ${docData.code} (${docData.name}) in ${docData.building}.`,
      },
      authToken
    );

    return serializeFacility(docData);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to create facility:', error);
    throw new Error('Unable to create facility.', { cause: error });
  }
}

export async function updateFacility(
  actor: DbUserRecord,
  facilityId: number,
  input: Partial<{
    code: string;
    name: string;
    category: string;
    building: string;
    floor: number;
    roomNumber: string;
    capacity: number;
    description: string;
    amenities: string[];
    imageKey: string;
    operationalStatus: string;
  }>,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const snap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(facilityId),
      authToken
    );

    if (!snap.exists || !snap.data) {
      throw new NotFoundError('Facility not found.');
    }

    const existing = snap.data;
    const nextCode = input.code ? input.code.toUpperCase() : existing.code;

    if (input.code && nextCode !== existing.code) {
      const dupRows = await client.query<FirestoreFacilityDoc>(
        COLLECTIONS.facilities,
        { where: [{ field: 'code', op: 'EQUAL', value: nextCode }], limit: 1 },
        authToken
      );
      if (dupRows.length > 0) {
        throw new ConflictError(`Facility code ${nextCode} already exists.`);
      }
    }

    const nowIso = new Date().toISOString();
    const updatedDoc: FirestoreFacilityDoc = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category as FacilityCategory } : {}),
      ...(input.building !== undefined ? { building: input.building } : {}),
      ...(input.floor !== undefined ? { floor: input.floor } : {}),
      ...(input.roomNumber !== undefined ? { roomNumber: input.roomNumber } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
      ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
      ...(input.operationalStatus !== undefined
        ? { operationalStatus: input.operationalStatus as OperationalStatus }
        : {}),
      code: nextCode,
      updatedAt: nowIso,
    };

    await client.update(
      COLLECTIONS.facilities,
      String(facilityId),
      {
        code: updatedDoc.code,
        name: updatedDoc.name,
        category: updatedDoc.category,
        building: updatedDoc.building,
        floor: updatedDoc.floor,
        roomNumber: updatedDoc.roomNumber,
        capacity: updatedDoc.capacity,
        description: updatedDoc.description,
        amenities: updatedDoc.amenities,
        imageKey: updatedDoc.imageKey,
        operationalStatus: updatedDoc.operationalStatus,
        updatedAt: SERVER_TIMESTAMP,
      },
      authToken
    );

    await createAuditLog(
      {
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'FACILITY_UPDATED',
        entityType: 'FACILITY',
        entityId: facilityId,
        details: `Updated facility ${updatedDoc.code} (${updatedDoc.operationalStatus}).`,
      },
      authToken
    );

    return serializeFacility(updatedDoc);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to update facility:', error);
    throw new Error('Unable to update facility.', { cause: error });
  }
}

export async function deleteOrArchiveFacility(
  actor: DbUserRecord,
  facilityId: number,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const snap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(facilityId),
      authToken
    );

    if (!snap.exists || !snap.data) {
      throw new NotFoundError('Facility not found.');
    }

    const existing = snap.data;
    const bookingRows = await client.query<FirestoreBookingDoc>(
      COLLECTIONS.bookings,
      { where: [{ field: 'facilityId', op: 'EQUAL', value: facilityId }] },
      authToken
    );

    const activeCount = bookingRows.filter(
      (r) => r.data.status === 'APPROVED' || r.data.status === 'PENDING'
    ).length;

    if (activeCount > 0) {
      const archivedDoc: FirestoreFacilityDoc = {
        ...existing,
        operationalStatus: 'DISABLED',
        updatedAt: new Date().toISOString(),
      };
      await client.update(
        COLLECTIONS.facilities,
        String(facilityId),
        { operationalStatus: 'DISABLED', updatedAt: SERVER_TIMESTAMP },
        authToken
      );

      await createAuditLog(
        {
          actorId: actor.id,
          actorUid: actor.uid,
          actorName: actor.fullName,
          action: 'FACILITY_ARCHIVED',
          entityType: 'FACILITY',
          entityId: facilityId,
          details: `Disabled facility ${archivedDoc.code} instead of hard-delete because active/pending bookings exist.`,
        },
        authToken
      );

      return { archived: true, facility: serializeFacility(archivedDoc) };
    }

    await client.delete(COLLECTIONS.facilities, String(facilityId), authToken);

    await createAuditLog(
      {
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'FACILITY_DELETED',
        entityType: 'FACILITY',
        entityId: facilityId,
        details: `Deleted facility ${existing.code} (${existing.name}).`,
      },
      authToken
    );

    return { archived: false, facility: serializeFacility(existing) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to delete/archive facility:', error);
    throw new Error('Unable to remove facility.', { cause: error });
  }
}
