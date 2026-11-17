import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../../lib/firebase-admin.ts';
import {
  COLLECTIONS,
  FirestoreRoleInviteDoc,
  FirestoreUserDoc,
  allocateNextId,
  createAuditLog,
  ensureFirestoreSeeded,
  getInviteDocId,
  serializeUser,
} from '../firestore/store.ts';
import { SERVER_TIMESTAMP, getFirestoreClient } from '../firestore/restClient.ts';
import { AppError, ForbiddenError, RoleMismatchError } from '../errors.ts';
import { loginSchema } from '../validators.ts';
import { AppUser, UserRole } from '../../shared/types.ts';

export type DbUserRecord = AppUser;

export interface AuthRequest extends Request {
  authToken?: string;
  firebaseUser?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  dbUser?: DbUserRecord;
}

function formatRoleName(role: UserRole): string {
  switch (role) {
    case 'STUDENT':
      return 'Student';
    case 'FACULTY':
      return 'Faculty';
    case 'MAINTENANCE_STAFF':
      return 'Maintenance Staff';
    case 'ADMIN':
      return 'Administrator';
  }
}

export async function getOrCreateCampusUser(params: {
  uid: string;
  email: string;
  fullName?: string;
  avatarUrl?: string | null;
  authToken: string;
  expectedRole?: UserRole;
}): Promise<DbUserRecord> {
  try {
    const client = getFirestoreClient();
    const existingSnap = await client.getDoc<FirestoreUserDoc>(
      COLLECTIONS.users,
      params.uid,
      params.authToken
    );

    if (existingSnap.exists && existingSnap.data) {
      const current = existingSnap.data;

      if (params.expectedRole && current.role !== params.expectedRole) {
        throw new RoleMismatchError(
          current.role,
          params.expectedRole,
          `Role mismatch: your account is registered as ${formatRoleName(
            current.role
          )}, not ${formatRoleName(params.expectedRole)}. Please select the ${formatRoleName(
            current.role
          )} portal tab.`
        );
      }

      if (
        params.avatarUrl &&
        params.avatarUrl.length <= 500 &&
        params.avatarUrl !== current.avatarUrl
      ) {
        await client.update(
          COLLECTIONS.users,
          params.uid,
          { avatarUrl: params.avatarUrl, updatedAt: SERVER_TIMESTAMP },
          params.authToken
        );
        current.avatarUrl = params.avatarUrl;
      }
      if (current.role === 'ADMIN') {
        await ensureFirestoreSeeded(params.authToken, true);
      }
      return serializeUser(current);
    }

    // New user onboarding — determine authorized role safely:
    // 1. Check Admin-provisioned role_invites/{sha256(email)} for a PENDING invite.
    // 2. Else check INITIAL_ADMIN_EMAIL / owner / unclaimed /config/bootstrap.
    // 3. Else allow public self-registration strictly for STUDENT or FACULTY.
    const configuredAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const lowerEmail = params.email.trim().toLowerCase();
    const isDesignatedAdminEmail =
      (configuredAdminEmail && lowerEmail === configuredAdminEmail) ||
      lowerEmail === 'gabrieljason938@gmail.com';

    const inviteId = getInviteDocId(lowerEmail);
    const [inviteSnap, bootstrapSnap] = await Promise.all([
      client.getDoc<FirestoreRoleInviteDoc>(COLLECTIONS.roleInvites, inviteId, params.authToken),
      client.getDoc<{ claimedByUid: string }>(
        COLLECTIONS.config,
        'bootstrap',
        params.authToken
      ),
    ]);

    const rawName =
      params.fullName?.trim() || params.email.split('@')[0] || 'Campus Member';
    const fallbackName =
      rawName.length >= 2 ? rawName.slice(0, 100) : 'Campus Member';
    const safeAvatarUrl =
      params.avatarUrl && params.avatarUrl.length <= 500 ? params.avatarUrl : null;

    // Path 1: Pre-provisioned role invitation from User Management
    if (inviteSnap.exists && inviteSnap.data && inviteSnap.data.status === 'PENDING') {
      const invite = inviteSnap.data;
      if (params.expectedRole && invite.role !== params.expectedRole) {
        throw new RoleMismatchError(
          invite.role,
          params.expectedRole,
          `Role mismatch: your institutional email is provisioned as ${formatRoleName(
            invite.role
          )}, not ${formatRoleName(params.expectedRole)}. Please select the ${formatRoleName(
            invite.role
          )} portal tab.`
        );
      }

      const createdUser = await client.runTransaction(async (tx) => {
        const [freshInviteSnap, userCounterSnap] = await Promise.all([
          tx.getDoc<FirestoreRoleInviteDoc>(COLLECTIONS.roleInvites, inviteId),
          tx.getDoc<{ nextId: number }>(COLLECTIONS.counters, COLLECTIONS.users),
        ]);

        if (!freshInviteSnap.exists || !freshInviteSnap.data || freshInviteSnap.data.status !== 'PENDING') {
          throw new ForbiddenError('Role invitation is no longer valid or has already been claimed.');
        }

        const freshInvite = freshInviteSnap.data;
        const nextId = userCounterSnap.exists
          ? Math.max(8, Number(userCounterSnap.data?.nextId || 8))
          : 8;

        const nowIso = new Date().toISOString();
        const userRecord: FirestoreUserDoc = {
          id: nextId,
          uid: params.uid,
          email: params.email,
          fullName: freshInvite.fullName || fallbackName,
          department: freshInvite.department || 'General Campus',
          role: freshInvite.role,
          accountStatus: 'ACTIVE',
          avatarUrl: safeAvatarUrl,
          profileCompleted: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        tx.update(COLLECTIONS.roleInvites, inviteId, {
          status: 'CLAIMED',
          claimedByUid: params.uid,
          claimedAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        });

        if (freshInvite.role === 'ADMIN') {
          tx.set(COLLECTIONS.admins, params.uid, {
            uid: params.uid,
            userId: nextId,
            grantedAt: SERVER_TIMESTAMP,
          });
        }

        tx.set(COLLECTIONS.users, params.uid, {
          ...userRecord,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        });

        tx.set(COLLECTIONS.counters, COLLECTIONS.users, { nextId: nextId + 1 });

        return userRecord;
      }, params.authToken);

      if (createdUser.role === 'ADMIN') {
        await ensureFirestoreSeeded(params.authToken, true);
      }

      await createAuditLog(
        {
          actorId: createdUser.id,
          actorUid: createdUser.uid,
          actorName: createdUser.fullName,
          action: 'ROLE_INVITE_CLAIMED',
          entityType: 'USER',
          entityId: createdUser.id,
          details: `User ${createdUser.email} signed in and claimed provisioned role ${createdUser.role}.`,
        },
        params.authToken
      );

      return serializeUser(createdUser);
    }

    // Path 2: First-time workspace bootstrap or designated primary Administrator
    const shouldBeAdmin = isDesignatedAdminEmail || !bootstrapSnap.exists;

    if (shouldBeAdmin) {
      if (params.expectedRole && params.expectedRole !== 'ADMIN') {
        throw new RoleMismatchError(
          'ADMIN',
          params.expectedRole,
          `Role mismatch: this workspace owner account requires the Administrator portal tab, not ${formatRoleName(
            params.expectedRole
          )}.`
        );
      }

      const createdUser = await client.runTransaction(async (tx) => {
        const [boot, userCounterSnap] = await Promise.all([
          tx.getDoc<{ claimedByUid: string }>(COLLECTIONS.config, 'bootstrap'),
          tx.getDoc<{ nextId: number }>(COLLECTIONS.counters, COLLECTIONS.users),
        ]);

        const nextId = userCounterSnap.exists
          ? Math.max(8, Number(userCounterSnap.data?.nextId || 8))
          : 8;

        const nowIso = new Date().toISOString();
        const userRecord: FirestoreUserDoc = {
          id: nextId,
          uid: params.uid,
          email: params.email,
          fullName: fallbackName,
          department: 'Campus Administration',
          role: 'ADMIN',
          accountStatus: 'ACTIVE',
          avatarUrl: safeAvatarUrl,
          profileCompleted: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        if (!boot.exists) {
          tx.set(COLLECTIONS.config, 'bootstrap', {
            claimedByUid: params.uid,
            claimedAt: SERVER_TIMESTAMP,
          });
        }

        tx.set(COLLECTIONS.admins, params.uid, {
          uid: params.uid,
          userId: nextId,
          grantedAt: SERVER_TIMESTAMP,
        });

        tx.set(COLLECTIONS.users, params.uid, {
          ...userRecord,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
        });

        tx.set(COLLECTIONS.counters, COLLECTIONS.users, { nextId: nextId + 1 });

        return userRecord;
      }, params.authToken);

      await ensureFirestoreSeeded(params.authToken, true);

      await createAuditLog(
        {
          actorId: createdUser.id,
          actorUid: createdUser.uid,
          actorName: createdUser.fullName,
          action: 'ADMIN_BOOTSTRAP_REGISTERED',
          entityType: 'USER',
          entityId: createdUser.id,
          details: `User ${createdUser.email} registered via Google Sign-In with role ADMIN.`,
        },
        params.authToken
      );

      return serializeUser(createdUser);
    }

    // Path 3: Public registration — strictly deny self-assignment of ADMIN or MAINTENANCE_STAFF
    if (params.expectedRole === 'ADMIN' || params.expectedRole === 'MAINTENANCE_STAFF') {
      throw new ForbiddenError(
        `${formatRoleName(
          params.expectedRole
        )} login requires an Administrator-provisioned account. Ask a Campus Administrator to provision your email in User Management, or sign in via the Student or Faculty portal.`
      );
    }

    const assignedRole: UserRole = params.expectedRole === 'FACULTY' ? 'FACULTY' : 'STUDENT';
    const id = await allocateNextId(COLLECTIONS.users, params.authToken);
    const nowIso = new Date().toISOString();
    const createdUser: FirestoreUserDoc = {
      id,
      uid: params.uid,
      email: params.email,
      fullName: fallbackName,
      department: 'General Campus',
      role: assignedRole,
      accountStatus: 'ACTIVE',
      avatarUrl: safeAvatarUrl,
      profileCompleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await client.set(
      COLLECTIONS.users,
      params.uid,
      {
        ...createdUser,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      },
      params.authToken
    );

    await createAuditLog(
      {
        actorId: createdUser.id,
        actorUid: createdUser.uid,
        actorName: createdUser.fullName,
        action: 'USER_REGISTERED',
        entityType: 'USER',
        entityId: createdUser.id,
        details: `User ${createdUser.email} registered via Google Sign-In with role ${createdUser.role}.`,
      },
      params.authToken
    );

    return serializeUser(createdUser);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Firestore user synchronization failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  let expectedRole: UserRole | undefined;
  if (req.method === 'POST' && req.path === '/api/auth/login') {
    const parsedLogin = loginSchema.safeParse(req.body || {});
    if (!parsedLogin.success) {
      return res.status(400).json({ error: 'Invalid login portal role selected.' });
    }
    expectedRole = parsedLogin.data.expectedRole as UserRole | undefined;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return res.status(401).json({ error: 'Authenticated account must include an email address.' });
    }

    req.authToken = token;
    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    };

    const dbUser = await getOrCreateCampusUser({
      uid: decoded.uid,
      email: decoded.email,
      fullName: decoded.name,
      avatarUrl: decoded.picture ?? null,
      authToken: token,
      expectedRole,
    });

    if (dbUser.accountStatus !== 'ACTIVE') {
      return res.status(403).json({
        error: 'Your campus account is currently deactivated. Please contact an administrator.',
      });
    }

    req.dbUser = dbUser;
    next();
  } catch (error) {
    if (error instanceof RoleMismatchError) {
      return res.status(403).json({
        error: error.message,
        code: 'ROLE_MISMATCH',
        actualRole: error.actualRole,
        expectedRole: error.expectedRole,
      });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Authentication token verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.dbUser.role as UserRole)) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};
