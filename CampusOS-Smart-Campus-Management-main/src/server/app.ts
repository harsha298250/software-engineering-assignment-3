import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import {
  COLLECTIONS,
  FirestoreAuditLogDoc,
  FirestoreFacilityDoc,
  FirestoreNotificationDoc,
  FirestoreRoleInviteDoc,
  FirestoreUserDoc,
  createAuditLog,
  getInviteDocId,
  serializeNotification,
  serializeRoleInvite,
  serializeUser,
  toIso,
} from './firestore/store.ts';
import { SERVER_TIMESTAMP, getFirestoreClient } from './firestore/restClient.ts';
import { AuthRequest, requireAuth, requireRole } from './middleware/auth.ts';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  RoleMismatchError,
} from './errors.ts';
import {
  adminProvisionUserSchema,
  adminUpdateUserSchema,
  approveBookingSchema,
  assignMaintenanceSchema,
  createBookingSchema,
  createMaintenanceSchema,
  facilitySchema,
  registerProfileSchema,
  rejectBookingSchema,
  updateMaintenanceStatusSchema,
} from './validators.ts';
import {
  createFacility,
  deleteOrArchiveFacility,
  getFacilityWithSlots,
  listFacilities,
  updateFacility,
} from './services/facilityService.ts';
import {
  approveBooking,
  cancelBooking,
  createBooking,
  getBookingById,
  listBookings,
  rejectBooking,
} from './services/bookingService.ts';
import {
  assignMaintenanceRequest,
  createMaintenanceRequest,
  getMaintenanceById,
  listMaintenanceRequests,
  updateMaintenanceStatus,
} from './services/maintenanceService.ts';
import {
  exportOperationalCsv,
  getDashboardAnalytics,
  getDashboardStats,
  getPublicOverview,
} from './services/dashboardService.ts';
import { AccountStatus, UserRole } from '../shared/types.ts';

function parsePositiveId(raw: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new BadRequestError('Invalid resource identifier.');
  }
  return num;
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  const allowedOrigin = process.env.CORS_ORIGIN || true;
  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });

  // Health Check (verifies live Cloud Firestore connectivity)
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const client = getFirestoreClient();
      await client.query<FirestoreFacilityDoc>(COLLECTIONS.facilities, { limit: 1 });
      res.json({ status: 'ok', database: 'firestore', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  // Public Overview for Landing Page
  app.get('/api/public/overview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await getPublicOverview();
      res.json(overview);
    } catch (error) {
      next(error);
    }
  });

  // ==================== AUTH ROUTES ====================
  app.post('/api/auth/login', authRateLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
    res.json({ user: req.dbUser });
  });

  app.post(
    '/api/auth/register',
    authRateLimiter,
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = registerProfileSchema.parse(req.body);
        const actor = req.dbUser!;
        const client = getFirestoreClient();

        // Only allow STUDENT/FACULTY selection during profile setup if not already privileged
        let nextRole: UserRole = actor.role;
        if (
          parsed.requestedRole &&
          (actor.role === 'STUDENT' || actor.role === 'FACULTY')
        ) {
          nextRole = parsed.requestedRole;
        }

        const snap = await client.getDoc<FirestoreUserDoc>(
          COLLECTIONS.users,
          actor.uid,
          req.authToken
        );
        if (!snap.exists || !snap.data) {
          throw new NotFoundError('User profile not found.');
        }

        const updatedDoc: FirestoreUserDoc = {
          ...snap.data,
          fullName: parsed.fullName,
          department: parsed.department,
          role: nextRole,
          profileCompleted: true,
          updatedAt: new Date().toISOString(),
        };

        const updatePatch: Record<string, unknown> = {
          fullName: updatedDoc.fullName,
          department: updatedDoc.department,
          profileCompleted: true,
          updatedAt: SERVER_TIMESTAMP,
        };
        if (nextRole !== snap.data.role) {
          updatePatch.role = nextRole;
        }

        await client.update(
          COLLECTIONS.users,
          actor.uid,
          updatePatch,
          req.authToken
        );

        await createAuditLog(
          {
            actorId: actor.id,
            actorUid: actor.uid,
            actorName: updatedDoc.fullName,
            action: 'PROFILE_UPDATED',
            entityType: 'USER',
            entityId: actor.id,
            details: `Completed/updated campus profile (${updatedDoc.department}, ${updatedDoc.role}).`,
          },
          req.authToken
        );

        res.json({ user: serializeUser(updatedDoc) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await createAuditLog(
        {
          actorId: req.dbUser!.id,
          actorUid: req.dbUser!.uid,
          actorName: req.dbUser!.fullName,
          action: 'USER_LOGOUT',
          entityType: 'USER',
          entityId: req.dbUser!.id,
          details: `User ${req.dbUser!.email} signed out.`,
        },
        req.authToken
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
    res.json({ user: req.dbUser });
  });

  // ==================== FACILITY ROUTES ====================
  app.get('/api/facilities', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await listFacilities(
        {
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          category: typeof req.query.category === 'string' ? req.query.category : undefined,
          building: typeof req.query.building === 'string' ? req.query.building : undefined,
          minCapacity: req.query.minCapacity ? Number(req.query.minCapacity) : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
        },
        req.authToken
      );
      res.json({ facilities: list });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/facilities/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveId(req.params.id);
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const result = await getFacilityWithSlots(id, date, req.dbUser!, req.authToken);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/facilities',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = facilitySchema.parse(req.body);
        const created = await createFacility(req.dbUser!, parsed, req.authToken);
        res.status(201).json({ facility: created });
      } catch (error) {
        next(error);
      }
    }
  );

  app.put(
    '/api/facilities/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = facilitySchema.partial().parse(req.body);
        const updated = await updateFacility(req.dbUser!, id, parsed, req.authToken);
        res.json({ facility: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    '/api/facilities/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const result = await deleteOrArchiveFacility(req.dbUser!, id, req.authToken);
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== BOOKING ROUTES ====================
  app.get('/api/bookings', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await listBookings(
        req.dbUser!,
        {
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          facilityId: req.query.facilityId ? Number(req.query.facilityId) : undefined,
          date: typeof req.query.date === 'string' ? req.query.date : undefined,
          scope: req.query.scope === 'mine' ? 'mine' : 'all',
        },
        req.authToken
      );
      res.json({ bookings: list });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bookings', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = createBookingSchema.parse(req.body);
      const created = await createBooking(
        req.dbUser!,
        {
          facilityId: parsed.facilityId,
          bookingDate: parsed.bookingDate,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          purpose: parsed.purpose,
          attendees: parsed.attendees,
          remarks: parsed.remarks,
        },
        req.authToken
      );
      res.status(201).json({ booking: created });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/bookings/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveId(req.params.id);
      const booking = await getBookingById(id, req.dbUser!, req.authToken);
      res.json({ booking });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/bookings/:id/cancel',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const updated = await cancelBooking(id, req.dbUser!, req.authToken);
        res.json({ booking: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/bookings/:id/approve',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = approveBookingSchema.parse(req.body || {});
        const updated = await approveBooking(
          id,
          req.dbUser!,
          parsed.approvalRemarks,
          req.authToken
        );
        res.json({ booking: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/bookings/:id/reject',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = rejectBookingSchema.parse(req.body);
        const updated = await rejectBooking(
          id,
          req.dbUser!,
          parsed.approvalRemarks,
          req.authToken
        );
        res.json({ booking: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== MAINTENANCE ROUTES ====================
  app.get('/api/maintenance', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await listMaintenanceRequests(
        req.dbUser!,
        {
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
          category: typeof req.query.category === 'string' ? req.query.category : undefined,
          scope:
            req.query.scope === 'mine' || req.query.scope === 'assigned'
              ? req.query.scope
              : 'all',
        },
        req.authToken
      );
      res.json({ requests: list });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/maintenance', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = createMaintenanceSchema.parse(req.body);
      const created = await createMaintenanceRequest(
        req.dbUser!,
        {
          facilityId: parsed.facilityId,
          title: parsed.title,
          description: parsed.description,
          category: parsed.category,
          priority: parsed.priority,
          reportedDate: parsed.reportedDate,
          attachmentNote: parsed.attachmentNote,
        },
        req.authToken
      );
      res.status(201).json({ request: created });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/maintenance/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = parsePositiveId(req.params.id);
      const item = await getMaintenanceById(id, req.dbUser!, req.authToken);
      res.json({ request: item });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/maintenance/:id/assign',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = assignMaintenanceSchema.parse(req.body);
        const updated = await assignMaintenanceRequest(
          id,
          req.dbUser!,
          parsed.assignedTo,
          parsed.priority,
          req.authToken
        );
        res.json({ request: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/maintenance/:id/status',
    requireAuth,
    requireRole('ADMIN', 'MAINTENANCE_STAFF'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = updateMaintenanceStatusSchema.parse(req.body);
        const updated = await updateMaintenanceStatus(
          id,
          req.dbUser!,
          parsed.status,
          parsed.resolutionRemarks,
          req.authToken
        );
        res.json({ request: updated });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== DASHBOARD ROUTES ====================
  app.get('/api/dashboard/stats', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const stats = await getDashboardStats(req.dbUser!, req.authToken);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    '/api/dashboard/analytics',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const analytics = await getDashboardAnalytics(req.dbUser!, req.authToken);
        res.json(analytics);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== NOTIFICATIONS ROUTES ====================
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const client = getFirestoreClient();
      const rows = await client.query<FirestoreNotificationDoc>(
        COLLECTIONS.notifications,
        { where: [{ field: 'userUid', op: 'EQUAL', value: req.dbUser!.uid }] },
        req.authToken
      );

      const list = rows
        .map((r) => serializeNotification(r.data))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);

      const unreadCount = list.filter((n) => !n.isRead).length;
      res.json({ notifications: list, unreadCount });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/api/notifications/read-all',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const client = getFirestoreClient();
        const rows = await client.query<FirestoreNotificationDoc>(
          COLLECTIONS.notifications,
          {
            where: [
              { field: 'userUid', op: 'EQUAL', value: req.dbUser!.uid },
              { field: 'isRead', op: 'EQUAL', value: false },
            ],
          },
          req.authToken
        );

        if (rows.length > 0) {
          await client.commitBatch(
            rows.map((r) => ({
              type: 'update',
              collection: COLLECTIONS.notifications,
              id: r.id,
              data: { isRead: true },
            })),
            req.authToken
          );
        }
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/notifications/:id/read',
    requireAuth,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const client = getFirestoreClient();
        const snap = await client.getDoc<FirestoreNotificationDoc>(
          COLLECTIONS.notifications,
          String(id),
          req.authToken
        );

        if (!snap.exists || !snap.data) {
          throw new NotFoundError('Notification not found.');
        }

        if (snap.data.userId !== req.dbUser!.id) {
          throw new ForbiddenError('Cannot modify another user notification.');
        }

        await client.update(
          COLLECTIONS.notifications,
          String(id),
          { isRead: true },
          req.authToken
        );
        res.json({ notification: serializeNotification({ ...snap.data, isRead: true }) });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== ADMIN ROUTES ====================
  app.get(
    '/api/admin/users',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const client = getFirestoreClient();
        const rows = await client.query<FirestoreUserDoc>(
          COLLECTIONS.users,
          undefined,
          req.authToken
        );
        let list = rows.map((r) => serializeUser(r.data));

        if (typeof req.query.role === 'string' && req.query.role !== 'ALL') {
          list = list.filter((u) => u.role === req.query.role);
        }

        if (typeof req.query.search === 'string' && req.query.search.trim()) {
          const q = req.query.search.trim().toLowerCase();
          list = list.filter(
            (u) =>
              u.fullName.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q) ||
              u.department.toLowerCase().includes(q)
          );
        }

        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        res.json({ users: list });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch(
    '/api/admin/users/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const id = parsePositiveId(req.params.id);
        const parsed = adminUpdateUserSchema.parse(req.body);
        const client = getFirestoreClient();

        const targetRows = await client.query<FirestoreUserDoc>(
          COLLECTIONS.users,
          { where: [{ field: 'id', op: 'EQUAL', value: id }], limit: 1 },
          req.authToken
        );

        if (targetRows.length === 0) {
          throw new NotFoundError('User account not found.');
        }

        const target = targetRows[0].data;

        const isDemotingOrDisablingAdmin =
          target.role === 'ADMIN' &&
          ((parsed.role && parsed.role !== 'ADMIN') ||
            parsed.accountStatus === 'INACTIVE');

        if (isDemotingOrDisablingAdmin && !target.uid.startsWith('seed-')) {
          const adminRows = await client.query<FirestoreUserDoc>(
            COLLECTIONS.users,
            {
              where: [
                { field: 'role', op: 'EQUAL', value: 'ADMIN' },
                { field: 'accountStatus', op: 'EQUAL', value: 'ACTIVE' },
              ],
            },
            req.authToken
          );

          const otherRealAdmins = adminRows.filter(
            (r) => !r.data.uid.startsWith('seed-') && r.data.id !== target.id
          );

          if (otherRealAdmins.length === 0) {
            throw new BadRequestError(
              'Cannot remove or deactivate the last active administrator account.'
            );
          }
        }

        const nextRole = (parsed.role ?? target.role) as UserRole;
        const nextStatus = (parsed.accountStatus ?? target.accountStatus) as AccountStatus;
        const nowIso = new Date().toISOString();

        const updatedDoc: FirestoreUserDoc = {
          ...target,
          ...(parsed.fullName !== undefined ? { fullName: parsed.fullName } : {}),
          ...(parsed.department !== undefined ? { department: parsed.department } : {}),
          role: nextRole,
          accountStatus: nextStatus,
          updatedAt: nowIso,
        };

        const batchOps: Array<
          | { type: 'set'; collection: string; id: string; data: Record<string, unknown> }
          | { type: 'update'; collection: string; id: string; data: Record<string, unknown> }
          | { type: 'delete'; collection: string; id: string }
        > = [
          {
            type: 'update',
            collection: COLLECTIONS.users,
            id: target.uid,
            data: {
              fullName: updatedDoc.fullName,
              department: updatedDoc.department,
              role: nextRole,
              accountStatus: nextStatus,
              updatedAt: SERVER_TIMESTAMP,
            },
          },
          nextRole === 'ADMIN' && nextStatus === 'ACTIVE'
            ? {
                type: 'set',
                collection: COLLECTIONS.admins,
                id: target.uid,
                data: { uid: target.uid, userId: target.id, grantedAt: SERVER_TIMESTAMP },
              }
            : {
                type: 'delete',
                collection: COLLECTIONS.admins,
                id: target.uid,
              },
        ];

        await client.commitBatch(batchOps, req.authToken);

        await createAuditLog(
          {
            actorId: req.dbUser!.id,
            actorUid: req.dbUser!.uid,
            actorName: req.dbUser!.fullName,
            action: 'USER_UPDATED_BY_ADMIN',
            entityType: 'USER',
            entityId: id,
            details: `Updated user ${updatedDoc.email}: role=${updatedDoc.role}, status=${updatedDoc.accountStatus}.`,
          },
          req.authToken
        );

        res.json({ user: serializeUser(updatedDoc) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/admin/users',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const parsed = adminProvisionUserSchema.parse(req.body);
        const normalizedEmail = parsed.email.trim().toLowerCase();
        const client = getFirestoreClient();

        const userRows = await client.query<FirestoreUserDoc>(
          COLLECTIONS.users,
          undefined,
          req.authToken
        );
        const existingUserRow = userRows.find(
          (r) => r.data.email.trim().toLowerCase() === normalizedEmail
        );

        if (existingUserRow) {
          const target = existingUserRow.data;
          const nextRole = parsed.role as UserRole;
          const isDemotingAdmin = target.role === 'ADMIN' && nextRole !== 'ADMIN';

          if (isDemotingAdmin && !target.uid.startsWith('seed-')) {
            const otherRealAdmins = userRows.filter(
              (r) =>
                !r.data.uid.startsWith('seed-') &&
                r.data.id !== target.id &&
                r.data.role === 'ADMIN' &&
                r.data.accountStatus === 'ACTIVE'
            );
            if (otherRealAdmins.length === 0) {
              throw new BadRequestError(
                'Cannot demote the last active administrator account.'
              );
            }
          }

          const nowIso = new Date().toISOString();
          const updatedDoc: FirestoreUserDoc = {
            ...target,
            fullName: parsed.fullName,
            department: parsed.department,
            role: nextRole,
            profileCompleted: true,
            updatedAt: nowIso,
          };

          await client.commitBatch(
            [
              {
                type: 'update',
                collection: COLLECTIONS.users,
                id: target.uid,
                data: {
                  fullName: parsed.fullName,
                  department: parsed.department,
                  role: nextRole,
                  profileCompleted: true,
                  updatedAt: SERVER_TIMESTAMP,
                },
              },
              nextRole === 'ADMIN' && target.accountStatus === 'ACTIVE'
                ? {
                    type: 'set',
                    collection: COLLECTIONS.admins,
                    id: target.uid,
                    data: { uid: target.uid, userId: target.id, grantedAt: SERVER_TIMESTAMP },
                  }
                : {
                    type: 'delete',
                    collection: COLLECTIONS.admins,
                    id: target.uid,
                  },
            ],
            req.authToken
          );

          await createAuditLog(
            {
              actorId: req.dbUser!.id,
              actorUid: req.dbUser!.uid,
              actorName: req.dbUser!.fullName,
              action: 'USER_UPDATED_BY_ADMIN',
              entityType: 'USER',
              entityId: target.id,
              details: `Provisioning updated existing account ${updatedDoc.email}: role=${updatedDoc.role}, department=${updatedDoc.department}.`,
            },
            req.authToken
          );

          return res.json({ mode: 'updated_user', user: serializeUser(updatedDoc) });
        }

        const inviteId = getInviteDocId(normalizedEmail);
        const existingInvite = await client.getDoc<FirestoreRoleInviteDoc>(
          COLLECTIONS.roleInvites,
          inviteId,
          req.authToken
        );

        const nowIso = new Date().toISOString();
        const inviteDoc: FirestoreRoleInviteDoc = {
          id: inviteId,
          email: normalizedEmail,
          fullName: parsed.fullName,
          department: parsed.department,
          role: parsed.role as UserRole,
          status: 'PENDING',
          invitedBy: req.dbUser!.id,
          invitedByName: req.dbUser!.fullName,
          claimedByUid: null,
          claimedAt: null,
          createdAt: existingInvite.data?.createdAt ? toIso(existingInvite.data.createdAt) : nowIso,
          updatedAt: nowIso,
        };

        if (existingInvite.exists) {
          await client.update(
            COLLECTIONS.roleInvites,
            inviteId,
            {
              fullName: inviteDoc.fullName,
              department: inviteDoc.department,
              role: inviteDoc.role,
              status: 'PENDING',
              invitedBy: inviteDoc.invitedBy,
              invitedByName: inviteDoc.invitedByName,
              claimedByUid: null,
              claimedAt: null,
              updatedAt: SERVER_TIMESTAMP,
            },
            req.authToken
          );
        } else {
          await client.set(
            COLLECTIONS.roleInvites,
            inviteId,
            {
              ...inviteDoc,
              createdAt: SERVER_TIMESTAMP,
              updatedAt: SERVER_TIMESTAMP,
            },
            req.authToken
          );
        }

        await createAuditLog(
          {
            actorId: req.dbUser!.id,
            actorUid: req.dbUser!.uid,
            actorName: req.dbUser!.fullName,
            action: 'ROLE_INVITE_PROVISIONED',
            entityType: 'USER',
            entityId: req.dbUser!.id,
            details: `Provisioned ${inviteDoc.role} role invitation for ${inviteDoc.email} (${inviteDoc.department}).`,
          },
          req.authToken
        );

        return res.status(201).json({
          mode: 'created_invite',
          invite: serializeRoleInvite(inviteDoc),
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    '/api/admin/invites',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const client = getFirestoreClient();
        const rows = await client.query<FirestoreRoleInviteDoc>(
          COLLECTIONS.roleInvites,
          undefined,
          req.authToken
        );
        const invites = rows
          .map((r) => serializeRoleInvite(r.data))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        res.json({ invites });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    '/api/admin/invites/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const inviteId = req.params.id;
        if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(inviteId)) {
          throw new BadRequestError('Invalid invitation identifier.');
        }

        const client = getFirestoreClient();
        const snap = await client.getDoc<FirestoreRoleInviteDoc>(
          COLLECTIONS.roleInvites,
          inviteId,
          req.authToken
        );
        if (!snap.exists || !snap.data) {
          throw new NotFoundError('Role invitation not found.');
        }

        await client.delete(COLLECTIONS.roleInvites, inviteId, req.authToken);

        await createAuditLog(
          {
            actorId: req.dbUser!.id,
            actorUid: req.dbUser!.uid,
            actorName: req.dbUser!.fullName,
            action: 'ROLE_INVITE_REVOKED',
            entityType: 'USER',
            entityId: req.dbUser!.id,
            details: `Revoked ${snap.data.role} role invitation for ${snap.data.email}.`,
          },
          req.authToken
        );

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    '/api/admin/audit-logs',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const client = getFirestoreClient();
        const [logRows, userRows] = await Promise.all([
          client.query<FirestoreAuditLogDoc>(
            COLLECTIONS.auditLogs,
            { orderBy: { field: 'timestamp', direction: 'DESCENDING' }, limit: 50 },
            req.authToken
          ),
          client.query<FirestoreUserDoc>(COLLECTIONS.users, undefined, req.authToken),
        ]);

        const usersById = new Map<number, FirestoreUserDoc>();
        for (const r of userRows) {
          usersById.set(r.data.id, r.data);
        }

        const logs = logRows.map((r) => {
          const l = r.data;
          const actor = l.actorId ? usersById.get(l.actorId) : undefined;
          return {
            id: l.id,
            actorId: l.actorId,
            action: l.action,
            entityType: l.entityType,
            entityId: l.entityId,
            details: l.details,
            timestamp: toIso(l.timestamp),
            actorName: actor?.fullName ?? l.actorName ?? null,
            actorEmail: actor?.email ?? null,
          };
        });

        res.json({ auditLogs: logs });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    '/api/admin/reports/export',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const dataset = req.query.dataset === 'maintenance' ? 'maintenance' : 'bookings';
        const csv = await exportOperationalCsv(dataset, req.authToken);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="smart-campus-${dataset}-report.csv"`
        );
        res.send(csv);
      } catch (error) {
        next(error);
      }
    }
  );

  // Unknown API endpoints return JSON 404
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Centralized Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: err.issues[0]?.message || 'Validation failed.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    if (err instanceof RoleMismatchError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: 'ROLE_MISMATCH',
        actualRole: err.actualRole,
        expectedRole: err.expectedRole,
      });
    }

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    console.error('Unhandled API error:', err);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}
