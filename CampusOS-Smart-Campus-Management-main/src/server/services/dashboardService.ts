import {
  COLLECTIONS,
  FirestoreAuditLogDoc,
  FirestoreBookingDoc,
  FirestoreFacilityDoc,
  FirestoreFacilityLockDoc,
  FirestoreMaintenanceDoc,
  FirestoreUserDoc,
  serializeFacility,
  toIso,
} from '../firestore/store.ts';
import { getFirestoreClient } from '../firestore/restClient.ts';
import { DbUserRecord } from '../middleware/auth.ts';

async function loadVisibleOperationalCollections(actor: DbUserRecord, authToken?: string) {
  const client = getFirestoreClient();
  const isAdmin = actor.role === 'ADMIN';

  const [facRows, bookRows, maintRows, auditRows, userRows] = await Promise.all([
    client.query<FirestoreFacilityDoc>(COLLECTIONS.facilities, undefined, authToken),
    client.query<FirestoreBookingDoc>(
      COLLECTIONS.bookings,
      isAdmin
        ? undefined
        : { where: [{ field: 'userUid', op: 'EQUAL', value: actor.uid }] },
      authToken
    ),
    client.query<FirestoreMaintenanceDoc>(
      COLLECTIONS.maintenanceRequests,
      isAdmin
        ? undefined
        : {
            where: [
              {
                field: actor.role === 'MAINTENANCE_STAFF' ? 'assigneeUid' : 'reporterUid',
                op: 'EQUAL',
                value: actor.uid,
              },
            ],
          },
      authToken
    ),
    isAdmin
      ? client.query<FirestoreAuditLogDoc>(
          COLLECTIONS.auditLogs,
          { orderBy: { field: 'timestamp', direction: 'DESCENDING' }, limit: 12 },
          authToken
        )
      : Promise.resolve([]),
    isAdmin
      ? client.query<FirestoreUserDoc>(COLLECTIONS.users, undefined, authToken)
      : Promise.resolve([]),
  ]);

  return {
    allFacilities: facRows.map((r) => r.data),
    allBookings: bookRows.map((r) => r.data),
    allMaintenance: maintRows.map((r) => r.data),
    recentLogs: auditRows.map((r) => r.data),
    allUsers: userRows.map((r) => r.data),
  };
}

export async function getDashboardStats(actor: DbUserRecord, authToken?: string) {
  try {
    const { allFacilities, allBookings, allMaintenance, recentLogs, allUsers } =
      await loadVisibleOperationalCollections(actor, authToken);

    const usersById = new Map<number, FirestoreUserDoc>();
    for (const u of allUsers) {
      usersById.set(u.id, u);
    }

    const totalFacilities = allFacilities.length;
    const availableRooms = allFacilities.filter(
      (f) => f.operationalStatus === 'OPERATIONAL'
    ).length;

    const todayStr = new Date().toISOString().slice(0, 10);

    const activeBookings = allBookings.filter(
      (b) => b.status === 'APPROVED' && b.bookingDate >= todayStr
    ).length;

    const pendingApprovals = allBookings.filter((b) => b.status === 'PENDING').length;

    const openMaintenance = allMaintenance.filter((m) =>
      ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(m.status)
    ).length;

    const completedMaintenance = allMaintenance.filter((m) =>
      ['RESOLVED', 'CLOSED'].includes(m.status)
    ).length;

    const myBookingsCount = allBookings.filter((b) => b.userId === actor.id).length;
    const myPendingBookings = allBookings.filter(
      (b) => b.userId === actor.id && b.status === 'PENDING'
    ).length;
    const myMaintenanceCount = allMaintenance.filter(
      (m) => m.reportedBy === actor.id
    ).length;
    const assignedTasksCount = allMaintenance.filter(
      (m) => m.assignedTo === actor.id && ['ASSIGNED', 'IN_PROGRESS'].includes(m.status)
    ).length;

    const recentActivity = recentLogs.map((log) => {
      const actorRecord = log.actorId ? usersById.get(log.actorId) : undefined;
      return {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        timestamp: toIso(log.timestamp),
        actorName: actorRecord?.fullName ?? log.actorName ?? null,
      };
    });

    return {
      kpis: {
        totalFacilities,
        availableRooms,
        activeBookings,
        pendingApprovals,
        openMaintenance,
        completedMaintenance,
      },
      personal: {
        myBookingsCount,
        myPendingBookings,
        myMaintenanceCount,
        assignedTasksCount,
      },
      recentActivity,
    };
  } catch (error) {
    console.error('Failed to compute dashboard stats:', error);
    throw new Error('Unable to load dashboard metrics.', { cause: error });
  }
}

export async function getDashboardAnalytics(actor: DbUserRecord, authToken?: string) {
  try {
    const { allFacilities, allBookings, allMaintenance } =
      await loadVisibleOperationalCollections(actor, authToken);

    const bookingMonthMap = new Map<string, { month: string; total: number; approved: number }>();
    for (const b of allBookings) {
      const month = b.bookingDate.slice(0, 7);
      const entry = bookingMonthMap.get(month) || { month, total: 0, approved: 0 };
      entry.total += 1;
      if (b.status === 'APPROVED' || b.status === 'COMPLETED') {
        entry.approved += 1;
      }
      bookingMonthMap.set(month, entry);
    }
    const monthlyBookingTrends = Array.from(bookingMonthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    const statusMap = new Map<string, number>();
    for (const b of allBookings) {
      statusMap.set(b.status, (statusMap.get(b.status) || 0) + 1);
    }
    const bookingStatusDistribution = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    const facilityBookingCount = new Map<number, number>();
    for (const b of allBookings) {
      if (b.status !== 'CANCELLED' && b.status !== 'REJECTED') {
        facilityBookingCount.set(b.facilityId, (facilityBookingCount.get(b.facilityId) || 0) + 1);
      }
    }
    const facilityUtilization = allFacilities
      .map((f) => ({
        name: f.code,
        fullName: f.name,
        category: f.category,
        bookings: facilityBookingCount.get(f.id) || 0,
        capacity: f.capacity,
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 8);

    const maintCatMap = new Map<string, number>();
    for (const m of allMaintenance) {
      maintCatMap.set(m.category, (maintCatMap.get(m.category) || 0) + 1);
    }
    const maintenanceByCategory = Array.from(maintCatMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    const maintMonthMap = new Map<
      string,
      { month: string; reported: number; resolved: number }
    >();
    for (const m of allMaintenance) {
      const month = m.reportedDate.slice(0, 7);
      const entry = maintMonthMap.get(month) || { month, reported: 0, resolved: 0 };
      entry.reported += 1;
      if (m.status === 'RESOLVED' || m.status === 'CLOSED') {
        entry.resolved += 1;
      }
      maintMonthMap.set(month, entry);
    }
    const maintenanceCompletionTrends = Array.from(maintMonthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    return {
      monthlyBookingTrends,
      bookingStatusDistribution,
      facilityUtilization,
      maintenanceByCategory,
      maintenanceCompletionTrends,
    };
  } catch (error) {
    console.error('Failed to compute dashboard analytics:', error);
    throw new Error('Unable to load analytics charts.', { cause: error });
  }
}

export async function getPublicOverview() {
  try {
    const client = getFirestoreClient();
    const todayStr = new Date().toISOString().slice(0, 10);

    const [facRows, lockRows] = await Promise.all([
      client.query<FirestoreFacilityDoc>(COLLECTIONS.facilities),
      client.query<FirestoreFacilityLockDoc>(COLLECTIONS.facilityLocks, {
        where: [{ field: 'bookingDate', op: 'EQUAL', value: todayStr }],
      }),
    ]);

    const allFacilities = facRows
      .map((r) => serializeFacility(r.data))
      .sort((a, b) => a.id - b.id);

    const activeToday = lockRows.reduce(
      (sum, r) => sum + (r.data.approvedSlots?.length || 0),
      0
    );

    return {
      totalFacilities: allFacilities.length,
      operationalFacilities: allFacilities.filter((f) => f.operationalStatus === 'OPERATIONAL')
        .length,
      activeBookingsToday: activeToday,
      featuredFacilities: allFacilities.slice(0, 6),
    };
  } catch (error) {
    console.error('Failed to load public overview:', error);
    throw new Error('Unable to load campus overview.', { cause: error });
  }
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportOperationalCsv(
  dataset: 'bookings' | 'maintenance',
  authToken?: string
) {
  try {
    const client = getFirestoreClient();
    const [facRows, userRows] = await Promise.all([
      client.query<FirestoreFacilityDoc>(COLLECTIONS.facilities, undefined, authToken),
      client.query<FirestoreUserDoc>(COLLECTIONS.users, undefined, authToken),
    ]);

    const facilitiesMap = new Map<number, FirestoreFacilityDoc>();
    for (const r of facRows) {
      facilitiesMap.set(r.data.id, r.data);
    }

    const usersMap = new Map<number, FirestoreUserDoc>();
    for (const r of userRows) {
      usersMap.set(r.data.id, r.data);
    }

    if (dataset === 'bookings') {
      const bookRows = await client.query<FirestoreBookingDoc>(
        COLLECTIONS.bookings,
        undefined,
        authToken
      );
      const rows = bookRows
        .map((r) => r.data)
        .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));

      const header = [
        'Booking ID',
        'Facility Code',
        'Facility Name',
        'Building',
        'Requester',
        'Email',
        'Date',
        'Start Time',
        'End Time',
        'Attendees',
        'Status',
        'Purpose',
        'Remarks',
      ].join(',');

      const lines = rows.map((r) => {
        const fac = facilitiesMap.get(r.facilityId);
        const usr = usersMap.get(r.userId);
        return [
          r.id,
          fac?.code ?? '',
          fac?.name ?? '',
          fac?.building ?? '',
          usr?.fullName ?? r.requesterName ?? '',
          usr?.email ?? '',
          r.bookingDate,
          r.startTime,
          r.endTime,
          r.attendees,
          r.status,
          r.purpose,
          r.approvalRemarks,
        ]
          .map(escapeCsvCell)
          .join(',');
      });

      return [header, ...lines].join('\n');
    }

    const maintRows = await client.query<FirestoreMaintenanceDoc>(
      COLLECTIONS.maintenanceRequests,
      undefined,
      authToken
    );
    const rows = maintRows
      .map((r) => r.data)
      .sort((a, b) => b.reportedDate.localeCompare(a.reportedDate));

    const header = [
      'Ticket ID',
      'Facility Code',
      'Facility Name',
      'Issue Title',
      'Category',
      'Priority',
      'Status',
      'Reported Date',
      'Reported By',
      'Resolution Remarks',
    ].join(',');

    const lines = rows.map((r) => {
      const fac = facilitiesMap.get(r.facilityId);
      const usr = usersMap.get(r.reportedBy);
      return [
        r.id,
        fac?.code ?? '',
        fac?.name ?? '',
        r.title,
        r.category,
        r.priority,
        r.status,
        r.reportedDate,
        usr?.fullName ?? r.reporterName ?? '',
        r.resolutionRemarks,
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    return [header, ...lines].join('\n');
  } catch (error) {
    console.error('Failed to export CSV report:', error);
    throw new Error('Unable to export CSV report.', { cause: error });
  }
}
