import {
  COLLECTIONS,
  FirestoreFacilityDoc,
  FirestoreMaintenanceDoc,
  FirestoreUserDoc,
  allocateNextId,
  createAuditLog,
  createNotificationDoc,
  findUserByNumericId,
  toIso,
} from '../firestore/store.ts';
import { SERVER_TIMESTAMP, getFirestoreClient } from '../firestore/restClient.ts';
import { DbUserRecord } from '../middleware/auth.ts';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../errors.ts';
import {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceWithRelations,
} from '../../shared/types.ts';

function hydrateMaintenance(
  m: FirestoreMaintenanceDoc,
  facilitiesMap: Map<number, FirestoreFacilityDoc>,
  usersById: Map<number, FirestoreUserDoc>
): MaintenanceWithRelations {
  const facility = facilitiesMap.get(m.facilityId);
  const reporter = usersById.get(m.reportedBy);
  const assignee = m.assignedTo ? usersById.get(m.assignedTo) : undefined;

  return {
    id: m.id,
    reportedBy: m.reportedBy,
    facilityId: m.facilityId,
    title: m.title,
    description: m.description,
    category: m.category,
    priority: m.priority,
    status: m.status,
    assignedTo: m.assignedTo ?? null,
    resolutionRemarks: m.resolutionRemarks ?? null,
    attachmentNote: m.attachmentNote ?? null,
    reportedDate: m.reportedDate,
    createdAt: toIso(m.createdAt),
    updatedAt: toIso(m.updatedAt),
    facilityName: facility?.name,
    facilityCode: facility?.code,
    facilityBuilding: facility?.building,
    reporterName: reporter?.fullName ?? m.reporterName ?? undefined,
    reporterEmail: reporter?.email,
    assigneeName: assignee?.fullName ?? m.assigneeName ?? null,
    assigneeEmail: assignee?.email ?? null,
  };
}

async function loadMaintenanceMaps(actor: DbUserRecord, authToken?: string) {
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
    usersById.set(actor.id, { ...actor });
  }

  return { facilitiesMap, usersById };
}

export async function listMaintenanceRequests(
  actor: DbUserRecord,
  filters: {
    status?: string;
    priority?: string;
    category?: string;
    scope?: 'mine' | 'assigned' | 'all';
  } = {},
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    let where;

    if (actor.role === 'MAINTENANCE_STAFF') {
      if (filters.scope === 'mine') {
        where = [{ field: 'reporterUid', op: 'EQUAL' as const, value: actor.uid }];
      } else {
        where = [{ field: 'assigneeUid', op: 'EQUAL' as const, value: actor.uid }];
      }
    } else if (actor.role !== 'ADMIN') {
      where = [{ field: 'reporterUid', op: 'EQUAL' as const, value: actor.uid }];
    } else if (filters.scope === 'mine') {
      where = [{ field: 'reporterUid', op: 'EQUAL' as const, value: actor.uid }];
    } else if (filters.scope === 'assigned') {
      where = [{ field: 'assigneeUid', op: 'EQUAL' as const, value: actor.uid }];
    }

    const [rows, { facilitiesMap, usersById }] = await Promise.all([
      client.query<FirestoreMaintenanceDoc>(
        COLLECTIONS.maintenanceRequests,
        { where },
        authToken
      ),
      loadMaintenanceMaps(actor, authToken),
    ]);

    let items = rows.map((r) => r.data);

    if (filters.status && filters.status !== 'ALL') {
      items = items.filter((m) => m.status === filters.status);
    }
    if (filters.priority && filters.priority !== 'ALL') {
      items = items.filter((m) => m.priority === filters.priority);
    }
    if (filters.category && filters.category !== 'ALL') {
      items = items.filter((m) => m.category === filters.category);
    }

    items.sort((a, b) => toIso(b.createdAt).localeCompare(toIso(a.createdAt)));

    return items.map((m) => hydrateMaintenance(m, facilitiesMap, usersById));
  } catch (error) {
    console.error('Failed to list maintenance requests:', error);
    throw new Error('Unable to load maintenance requests.', { cause: error });
  }
}

export async function getMaintenanceById(
  id: number,
  actor: DbUserRecord,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const snap = await client.getDoc<FirestoreMaintenanceDoc>(
      COLLECTIONS.maintenanceRequests,
      String(id),
      authToken
    );

    if (!snap.exists || !snap.data) {
      throw new NotFoundError('Maintenance request not found.');
    }

    const ticket = snap.data;
    if (
      actor.role !== 'ADMIN' &&
      ticket.reportedBy !== actor.id &&
      ticket.assignedTo !== actor.id
    ) {
      throw new ForbiddenError('You are not authorized to view this maintenance ticket.');
    }

    const { facilitiesMap, usersById } = await loadMaintenanceMaps(actor, authToken);
    return hydrateMaintenance(ticket, facilitiesMap, usersById);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to fetch maintenance request:', error);
    throw new Error('Unable to load maintenance request.', { cause: error });
  }
}

export async function createMaintenanceRequest(
  actor: DbUserRecord,
  input: {
    facilityId: number;
    title: string;
    description: string;
    category: string;
    priority: string;
    reportedDate?: string;
    attachmentNote?: string | null;
  },
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const facSnap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(input.facilityId),
      authToken
    );

    if (!facSnap.exists || !facSnap.data) {
      throw new NotFoundError('Selected facility does not exist.');
    }

    const facility = facSnap.data;
    const reportedDate = input.reportedDate || new Date().toISOString().slice(0, 10);
    const id = await allocateNextId(COLLECTIONS.maintenanceRequests, authToken);
    const nowIso = new Date().toISOString();

    const ticket: FirestoreMaintenanceDoc = {
      id,
      reportedBy: actor.id,
      reporterUid: actor.uid,
      facilityId: input.facilityId,
      title: input.title,
      description: input.description,
      category: input.category as MaintenanceCategory,
      priority: input.priority as MaintenancePriority,
      status: 'OPEN',
      assignedTo: null,
      assigneeUid: null,
      reporterName: actor.fullName,
      assigneeName: null,
      resolutionRemarks: null,
      attachmentNote: input.attachmentNote ?? null,
      reportedDate,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await client.set(
      COLLECTIONS.maintenanceRequests,
      String(id),
      {
        ...ticket,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
      authToken
    );

    await createNotificationDoc(
      {
        userId: actor.id,
        userUid: actor.uid,
        title: `Maintenance Ticket Logged: ${facility.code}`,
        message: `Your issue "${input.title}" has been logged with ${input.priority} priority.`,
        type: 'MAINTENANCE',
      },
      authToken
    );

    const adminMarkers = await client.query<{ uid: string; userId?: number }>(
      COLLECTIONS.admins,
      undefined,
      authToken
    );
    for (const marker of adminMarkers) {
      const adminUid = marker.data.uid;
      const adminUserId = marker.data.userId;
      if (adminUid && adminUid !== actor.uid && adminUserId && adminUserId > 0) {
        await createNotificationDoc(
          {
            userId: adminUserId,
            userUid: adminUid,
            title: `New ${input.priority} Maintenance Issue`,
            message: `${actor.fullName} reported "${input.title}" in ${facility.name}.`,
            type: 'MAINTENANCE',
          },
          authToken
        );
      }
    }

    await createAuditLog(
      {
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'MAINTENANCE_REPORTED',
        entityType: 'MAINTENANCE',
        entityId: id,
        details: `Reported ${input.priority} ${input.category} issue in ${facility.code}: ${input.title}`,
      },
      authToken
    );

    return ticket;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to submit maintenance request:', error);
    throw new Error('Unable to submit maintenance request.', { cause: error });
  }
}

export async function assignMaintenanceRequest(
  id: number,
  adminUser: DbUserRecord,
  assignedToId: number,
  priority?: string,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const ticketSnap = await client.getDoc<FirestoreMaintenanceDoc>(
      COLLECTIONS.maintenanceRequests,
      String(id),
      authToken
    );

    if (!ticketSnap.exists || !ticketSnap.data) {
      throw new NotFoundError('Maintenance request not found.');
    }

    const existing = ticketSnap.data;
    const technician = await findUserByNumericId(assignedToId, authToken);

    if (!technician) {
      throw new NotFoundError('Selected technician does not exist.');
    }

    if (technician.role !== 'MAINTENANCE_STAFF' && technician.role !== 'ADMIN') {
      throw new BadRequestError('Tasks can only be assigned to maintenance staff accounts.');
    }

    const facSnap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(existing.facilityId),
      authToken
    );
    const facility = facSnap.exists ? facSnap.data : null;

    const nextStatus: MaintenanceStatus =
      existing.status === 'OPEN' ? 'ASSIGNED' : existing.status;
    const nextPriority = priority
      ? (priority as MaintenancePriority)
      : existing.priority;
    const nowIso = new Date().toISOString();

    await client.update(
      COLLECTIONS.maintenanceRequests,
      String(id),
      {
        assignedTo: assignedToId,
        assigneeUid: technician.uid,
        assigneeName: technician.fullName,
        status: nextStatus,
        priority: nextPriority,
        updatedAt: SERVER_TIMESTAMP,
      },
      authToken
    );

    await createNotificationDoc(
      {
        userId: technician.id,
        userUid: technician.uid,
        title: `Maintenance Task Assigned: ${facility?.code ?? 'Campus'}`,
        message: `You have been assigned "${existing.title}" in ${facility?.name ?? 'campus facility'}.`,
        type: 'MAINTENANCE',
      },
      authToken
    );

    await createNotificationDoc(
      {
        userId: existing.reportedBy,
        userUid: existing.reporterUid,
        title: `Technician Assigned: ${existing.title}`,
        message: `${technician.fullName} has been assigned to your maintenance request.`,
        type: 'MAINTENANCE',
      },
      authToken
    );

    await createAuditLog(
      {
        actorId: adminUser.id,
        actorUid: adminUser.uid,
        actorName: adminUser.fullName,
        action: 'MAINTENANCE_ASSIGNED',
        entityType: 'MAINTENANCE',
        entityId: id,
        details: `Assigned ticket #${id} to ${technician.fullName}${priority ? ` (priority: ${priority})` : ''}.`,
      },
      authToken
    );

    return {
      ...existing,
      assignedTo: assignedToId,
      assigneeUid: technician.uid,
      assigneeName: technician.fullName,
      status: nextStatus,
      priority: nextPriority,
      updatedAt: nowIso,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to assign maintenance request:', error);
    throw new Error('Unable to assign maintenance request.', { cause: error });
  }
}

export async function updateMaintenanceStatus(
  id: number,
  actor: DbUserRecord,
  status: string,
  resolutionRemarks?: string | null,
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const ticketSnap = await client.getDoc<FirestoreMaintenanceDoc>(
      COLLECTIONS.maintenanceRequests,
      String(id),
      authToken
    );

    if (!ticketSnap.exists || !ticketSnap.data) {
      throw new NotFoundError('Maintenance request not found.');
    }

    const ticket = ticketSnap.data;

    if (actor.role === 'MAINTENANCE_STAFF') {
      if (ticket.assignedTo !== actor.id) {
        throw new ForbiddenError('You can only update tasks assigned to you.');
      }
      if (status === 'CLOSED') {
        throw new ForbiddenError('Only an administrator can formally close a resolved ticket.');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('You are not authorized to update maintenance ticket status.');
    }

    if (status === 'RESOLVED' && !resolutionRemarks?.trim() && !ticket.resolutionRemarks) {
      throw new BadRequestError('Resolution remarks are required when marking a task as resolved.');
    }

    const facSnap = await client.getDoc<FirestoreFacilityDoc>(
      COLLECTIONS.facilities,
      String(ticket.facilityId),
      authToken
    );
    const facility = facSnap.exists ? facSnap.data : null;

    const nextRemarks =
      resolutionRemarks !== undefined
        ? resolutionRemarks?.trim() || null
        : ticket.resolutionRemarks;
    const nowIso = new Date().toISOString();

    await client.update(
      COLLECTIONS.maintenanceRequests,
      String(id),
      {
        status: status as MaintenanceStatus,
        resolutionRemarks: nextRemarks,
        updatedAt: SERVER_TIMESTAMP,
      },
      authToken
    );

    const notifTitle =
      status === 'RESOLVED'
        ? `Maintenance Resolved: ${ticket.title}`
        : `Maintenance Status Updated: ${ticket.title}`;
    const notifMessage =
      status === 'RESOLVED'
        ? `Work in ${facility?.name ?? 'facility'} is resolved: ${resolutionRemarks?.trim() || nextRemarks}`
        : `Status updated to ${status.replace('_', ' ')} by ${actor.fullName}.`;

    await createNotificationDoc(
      {
        userId: ticket.reportedBy,
        userUid: ticket.reporterUid,
        title: notifTitle,
        message: notifMessage,
        type: 'MAINTENANCE',
      },
      authToken
    );

    if (status === 'RESOLVED') {
      const adminMarkers = await client.query<{ uid: string; userId?: number }>(
        COLLECTIONS.admins,
        undefined,
        authToken
      );
      for (const marker of adminMarkers) {
        const adminUid = marker.data.uid;
        const adminUserId = marker.data.userId;
        if (adminUid && adminUid !== actor.uid && adminUserId && adminUserId > 0) {
          await createNotificationDoc(
            {
              userId: adminUserId,
              userUid: adminUid,
              title: `Ticket #${id} Ready for Review`,
              message: `${actor.fullName} marked "${ticket.title}" as resolved.`,
              type: 'MAINTENANCE',
            },
            authToken
          );
        }
      }
    }

    await createAuditLog(
      {
        actorId: actor.id,
        actorUid: actor.uid,
        actorName: actor.fullName,
        action: 'MAINTENANCE_STATUS_UPDATED',
        entityType: 'MAINTENANCE',
        entityId: id,
        details: `Changed ticket #${id} status from ${ticket.status} to ${status}.`,
      },
      authToken
    );

    return {
      ...ticket,
      status: status as MaintenanceStatus,
      resolutionRemarks: nextRemarks,
      updatedAt: nowIso,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Failed to update maintenance status:', error);
    throw new Error('Unable to update maintenance status.', { cause: error });
  }
}
