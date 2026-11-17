import crypto from 'node:crypto';
import {
  FieldInputValue,
  FirestoreTransaction,
  SERVER_TIMESTAMP,
  getFirestoreClient,
} from './restClient.ts';
import {
  AccountStatus,
  BookingStatus,
  FacilityCategory,
  InviteStatus,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  OperationalStatus,
  RoleInvite,
  UserRole,
} from '../../shared/types.ts';

export const COLLECTIONS = {
  users: 'users',
  admins: 'admins',
  config: 'config',
  facilities: 'facilities',
  bookings: 'bookings',
  facilityLocks: 'facility_locks',
  maintenanceRequests: 'maintenance_requests',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  counters: 'counters',
  roleInvites: 'role_invites',
} as const;

export interface FirestoreUserDoc {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  department: string;
  role: UserRole;
  accountStatus: AccountStatus;
  avatarUrl: string | null;
  profileCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreFacilityDoc {
  id: number;
  code: string;
  name: string;
  category: FacilityCategory;
  building: string;
  floor: number;
  roomNumber: string;
  capacity: number;
  description: string;
  amenities: string[];
  imageKey: string;
  operationalStatus: OperationalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreBookingDoc {
  id: number;
  userId: number;
  userUid: string;
  facilityId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendees: number;
  remarks: string | null;
  status: BookingStatus;
  approvalRemarks: string | null;
  approvedBy: number | null;
  requesterName?: string | null;
  requesterRole?: UserRole | null;
  approverName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedSlotLock {
  bookingId: number;
  startTime: string;
  endTime: string;
  purpose?: string;
}

export interface FirestoreFacilityLockDoc {
  facilityId: number;
  bookingDate: string;
  approvedSlots: ApprovedSlotLock[];
  lastCancelledBookingId?: number | null;
  updatedAt: string;
}

export interface FirestoreMaintenanceDoc {
  id: number;
  reportedBy: number;
  reporterUid: string;
  facilityId: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo: number | null;
  assigneeUid: string | null;
  reporterName?: string | null;
  assigneeName?: string | null;
  resolutionRemarks: string | null;
  attachmentNote: string | null;
  reportedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreNotificationDoc {
  id: number;
  userId: number;
  userUid: string;
  title: string;
  message: string;
  type: 'BOOKING' | 'MAINTENANCE' | 'SYSTEM';
  isRead: boolean;
  createdAt: string;
}

export interface FirestoreAuditLogDoc {
  id: number;
  actorId: number | null;
  actorUid?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId: number;
  details: string | null;
  timestamp: string;
}

export interface FirestoreRoleInviteDoc {
  id: string;
  email: string;
  fullName: string;
  department: string;
  role: UserRole;
  status: InviteStatus;
  invitedBy: number;
  invitedByName: string;
  claimedByUid?: string | null;
  claimedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getInviteDocId(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function toIso(val: Date | string | null | undefined): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export function serializeUser(doc: FirestoreUserDoc) {
  return {
    id: doc.id,
    uid: doc.uid,
    fullName: doc.fullName,
    email: doc.email,
    department: doc.department,
    role: doc.role,
    accountStatus: doc.accountStatus,
    avatarUrl: doc.avatarUrl ?? null,
    profileCompleted: doc.profileCompleted,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function serializeFacility(doc: FirestoreFacilityDoc) {
  return {
    id: doc.id,
    code: doc.code,
    name: doc.name,
    category: doc.category,
    building: doc.building,
    floor: doc.floor,
    roomNumber: doc.roomNumber,
    capacity: doc.capacity,
    description: doc.description,
    amenities: Array.isArray(doc.amenities) ? doc.amenities : [],
    imageKey: doc.imageKey,
    operationalStatus: doc.operationalStatus,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function serializeNotification(doc: FirestoreNotificationDoc) {
  return {
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    message: doc.message,
    type: doc.type,
    isRead: doc.isRead,
    createdAt: toIso(doc.createdAt),
  };
}

export function serializeRoleInvite(doc: FirestoreRoleInviteDoc): RoleInvite {
  return {
    id: doc.id,
    email: doc.email,
    fullName: doc.fullName,
    department: doc.department,
    role: doc.role,
    status: doc.status,
    invitedBy: doc.invitedBy,
    invitedByName: doc.invitedByName,
    claimedByUid: doc.claimedByUid ?? null,
    claimedAt: doc.claimedAt ? toIso(doc.claimedAt) : null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function getFacilityLockId(facilityId: number, bookingDate: string): string {
  return `${facilityId}_${bookingDate}`;
}

export async function allocateNextId(
  collectionName: string,
  authToken?: string
): Promise<number> {
  const client = getFirestoreClient();
  return client.runTransaction(async (tx) => {
    const snap = await tx.getDoc<{ nextId: number }>(COLLECTIONS.counters, collectionName);
    const current = snap.exists ? Number(snap.data?.nextId || 1) : 1;
    tx.set(COLLECTIONS.counters, collectionName, { nextId: current + 1 });
    return current;
  }, authToken);
}

export async function allocateIdBlock(
  collectionName: string,
  count: number,
  authToken?: string
): Promise<number> {
  if (count <= 0) return 0;
  const client = getFirestoreClient();
  return client.runTransaction(async (tx) => {
    const snap = await tx.getDoc<{ nextId: number }>(COLLECTIONS.counters, collectionName);
    const start = snap.exists ? Number(snap.data?.nextId || 1) : 1;
    tx.set(COLLECTIONS.counters, collectionName, { nextId: start + count });
    return start;
  }, authToken);
}

export async function readCounterNextId(
  tx: FirestoreTransaction,
  collectionName: string
): Promise<number> {
  const snap = await tx.getDoc<{ nextId: number }>(COLLECTIONS.counters, collectionName);
  return snap.exists ? Number(snap.data?.nextId || 1) : 1;
}

export async function createAuditLog(
  params: {
    actorId: number | null;
    actorUid?: string | null;
    actorName?: string | null;
    action: string;
    entityType: string;
    entityId: number;
    details: string | null;
  },
  authToken?: string
) {
  const client = getFirestoreClient();
  const id = await allocateNextId(COLLECTIONS.auditLogs, authToken);
  const payload: Record<string, FieldInputValue> = {
    id,
    actorId: params.actorId,
    actorUid: params.actorUid ?? null,
    actorName: params.actorName ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    timestamp: SERVER_TIMESTAMP,
  };
  await client.set(COLLECTIONS.auditLogs, String(id), payload, authToken);
  return {
    id,
    actorId: params.actorId,
    actorUid: params.actorUid ?? null,
    actorName: params.actorName ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    timestamp: new Date().toISOString(),
  };
}

export async function createNotificationDoc(
  params: {
    userId: number;
    userUid: string;
    title: string;
    message: string;
    type: 'BOOKING' | 'MAINTENANCE' | 'SYSTEM';
  },
  authToken?: string
) {
  const client = getFirestoreClient();
  const id = await allocateNextId(COLLECTIONS.notifications, authToken);
  const payload: Record<string, FieldInputValue> = {
    id,
    userId: params.userId,
    userUid: params.userUid,
    title: params.title,
    message: params.message,
    type: params.type,
    isRead: false,
    createdAt: SERVER_TIMESTAMP,
  };
  await client.set(COLLECTIONS.notifications, String(id), payload, authToken);
  return {
    id,
    userId: params.userId,
    userUid: params.userUid,
    title: params.title,
    message: params.message,
    type: params.type,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

export async function findUserByNumericId(
  id: number,
  authToken?: string
): Promise<FirestoreUserDoc | null> {
  const client = getFirestoreClient();
  const rows = await client.query<FirestoreUserDoc>(
    COLLECTIONS.users,
    { where: [{ field: 'id', op: 'EQUAL', value: id }], limit: 1 },
    authToken
  );
  return rows.length > 0 ? rows[0].data : null;
}

function shiftDate(baseDate: Date, deltaDays: number): string {
  const d = new Date(baseDate.getTime() + deltaDays * 86400000);
  return d.toISOString().slice(0, 10);
}

let seedDone = false;
let seedInFlight: Promise<void> | null = null;

export function resetSeedCacheForTesting(): void {
  seedDone = false;
  seedInFlight = null;
}

export async function ensureFirestoreSeeded(
  authToken?: string,
  canWriteSeed = false
): Promise<void> {
  if (seedDone) return;
  if (!canWriteSeed) {
    // Only seed when an authenticated Admin (or test transport) is driving the write
    return;
  }
  if (!seedInFlight) {
    seedInFlight = runIdempotentSeed(authToken)
      .then(() => {
        seedDone = true;
      })
      .finally(() => {
        seedInFlight = null;
      });
  }
  return seedInFlight;
}

export async function runIdempotentSeed(authToken?: string): Promise<void> {
  const client = getFirestoreClient();
  const existingFacilities = await client.query<FirestoreFacilityDoc>(
    COLLECTIONS.facilities,
    { limit: 1 },
    authToken
  );
  if (existingFacilities.length > 0) {
    seedDone = true;
    return;
  }

  const today = new Date();

  const seedUsers: Array<Omit<FirestoreUserDoc, 'createdAt' | 'updatedAt'>> = [
    {
      id: 1,
      uid: 'seed-admin-01',
      fullName: 'Dr. Elena Vance',
      email: 'elena.vance@northbridge.edu',
      department: 'Campus Operations & Estates',
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 2,
      uid: 'seed-student-01',
      fullName: 'Maya Lin',
      email: 'maya.lin@northbridge.edu',
      department: 'Computer Science',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 3,
      uid: 'seed-student-02',
      fullName: 'Liam Patel',
      email: 'liam.patel@northbridge.edu',
      department: 'Mechanical Engineering',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 4,
      uid: 'seed-faculty-01',
      fullName: 'Prof. Arthur Pendelton',
      email: 'a.pendelton@northbridge.edu',
      department: 'School of Computing',
      role: 'FACULTY',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 5,
      uid: 'seed-faculty-02',
      fullName: 'Dr. Priya Nair',
      email: 'p.nair@northbridge.edu',
      department: 'Applied Mathematics',
      role: 'FACULTY',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 6,
      uid: 'seed-staff-01',
      fullName: 'Marcus Chen',
      email: 'm.chen@northbridge.edu',
      department: 'Facilities Maintenance — Electrical & AV',
      role: 'MAINTENANCE_STAFF',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
    {
      id: 7,
      uid: 'seed-staff-02',
      fullName: 'Elena Rodriguez',
      email: 'e.rodriguez@northbridge.edu',
      department: 'Facilities Maintenance — HVAC & Plumbing',
      role: 'MAINTENANCE_STAFF',
      accountStatus: 'ACTIVE',
      avatarUrl: null,
      profileCompleted: true,
    },
  ];

  const seedFacilities: Array<Omit<FirestoreFacilityDoc, 'createdAt' | 'updatedAt'>> = [
    {
      id: 1,
      code: 'FAC-101',
      name: 'Turing Lecture Theatre',
      category: 'Classrooms',
      building: 'Turing Hall',
      floor: 1,
      roomNumber: '101',
      capacity: 120,
      description:
        'Tiered acoustic lecture theatre equipped with dual 4K laser projection, lecture capture cameras, and individual desk power outlets.',
      amenities: ['Dual 4K Projectors', 'Lecture Capture', 'Acoustic Paneling', 'Desk Power'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 2,
      code: 'FAC-102',
      name: 'Systems & Cloud Lab A',
      category: 'Computer Laboratories',
      building: 'Engineering West',
      floor: 2,
      roomNumber: '204',
      capacity: 48,
      description:
        'High-density systems engineering laboratory featuring 48 Linux/Windows dual-boot workstations and 10GbE fiber networking.',
      amenities: ['48 Workstations', '10GbE Fiber', 'Smart Whiteboard', 'Badge Access'],
      imageKey: 'computer_lab',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 3,
      code: 'FAC-103',
      name: 'Ada Lovelace Seminar Suite',
      category: 'Seminar Halls',
      building: 'Mathematics Pavilion',
      floor: 3,
      roomNumber: '302',
      capacity: 64,
      description:
        'Sunlit collaborative seminar hall designed for graduate colloquia, guest workshops, and interactive thesis defenses.',
      amenities: ['4K Laser Display', 'Wireless Presentation', 'Modular Seating'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 4,
      code: 'FAC-104',
      name: 'Senate Executive Conference Room',
      category: 'Conference Rooms',
      building: 'Administration Wing',
      floor: 4,
      roomNumber: '401',
      capacity: 24,
      description:
        'Executive boardroom with integrated spatial beamforming microphones, dual conference monitors, and acoustic privacy glazing.',
      amenities: ['Video Conferencing', 'Beamforming Audio', 'Acoustic Glass'],
      imageKey: 'auditorium',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 5,
      code: 'FAC-105',
      name: 'Founders Grand Auditorium',
      category: 'Auditoriums',
      building: 'Central Arts Hall',
      floor: 1,
      roomNumber: '100',
      capacity: 420,
      description:
        'Flagship university performance and keynote auditorium with concert-grade line array audio and theatrical rigging.',
      amenities: ['Line Array Audio', 'Stage Lighting Rig', '420 Tiered Seats', 'Live Streaming'],
      imageKey: 'auditorium',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 6,
      code: 'FAC-106',
      name: 'Faculty Collaboration Studio B',
      category: 'Meeting Rooms',
      building: 'Research Commons',
      floor: 2,
      roomNumber: '215',
      capacity: 14,
      description:
        'Quiet interdisciplinary meeting suite suited for grant reviews and faculty committee sessions.',
      amenities: ['65-inch 4K Display', 'Magnetic Glass Board', 'USB-C Hub'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 7,
      code: 'FAC-107',
      name: 'Northbridge Indoor Pavilion',
      category: 'Sports Facilities',
      building: 'Athletics Complex',
      floor: 1,
      roomNumber: '110',
      capacity: 200,
      description:
        'Regulation maple hardwood indoor court supporting varsity basketball, badminton tournaments, and intramural athletics.',
      amenities: ['Maple Hardwood Court', 'Electronic Scoreboard', 'Spectator Bleachers'],
      imageKey: 'sports_complex',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 8,
      code: 'FAC-108',
      name: 'Robotics & Embedded Prototyping Lab',
      category: 'Computer Laboratories',
      building: 'Engineering West',
      floor: 1,
      roomNumber: '118',
      capacity: 32,
      description:
        'Dedicated hardware prototyping and IoT workbench space with ESD-safe benches, oscilloscopes, and 3D fabrication enclosures.',
      amenities: ['ESD Workbenches', 'Oscilloscopes', '3D Printer Bay', 'Fume Extraction'],
      imageKey: 'computer_lab',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 9,
      code: 'FAC-109',
      name: 'Humanities Seminar Room 208',
      category: 'Classrooms',
      building: 'Founders Hall',
      floor: 2,
      roomNumber: '208',
      capacity: 40,
      description:
        'Classic seminar classroom combining natural courtyard light with flexible roundtable configuration.',
      amenities: ['Movable Tables', 'HD Projector', 'Natural Daylight'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 10,
      code: 'FAC-110',
      name: 'Bio-Sciences Wet Lab',
      category: 'Other Campus Resources',
      building: 'Science Annex',
      floor: 3,
      roomNumber: '312',
      capacity: 28,
      description:
        'Climate-controlled instructional laboratory with biosafety hoods, emergency eyewash stations, and deionized water lines.',
      amenities: ['Fume Hoods', 'Deionized Water', 'Emergency Eyewash'],
      imageKey: 'computer_lab',
      operationalStatus: 'UNDER_MAINTENANCE',
    },
    {
      id: 11,
      code: 'FAC-111',
      name: 'Deans Boardroom',
      category: 'Conference Rooms',
      building: 'Administration Wing',
      floor: 3,
      roomNumber: '305',
      capacity: 18,
      description:
        'Formal academic leadership meeting room overlooking the central quadrangle with dual 75-inch displays.',
      amenities: ['Dual 75-inch Displays', 'Conference Bridge', 'Document Camera'],
      imageKey: 'auditorium',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 12,
      code: 'FAC-112',
      name: 'Graduate Study & Media Pod',
      category: 'Meeting Rooms',
      building: 'University Library',
      floor: 2,
      roomNumber: '220',
      capacity: 10,
      description:
        'Bookable quiet group study room with acoustic wall baffles and shared display mirroring.',
      amenities: ['Wireless Screen Share', 'Writable Wall', 'Wi-Fi 6E'],
      imageKey: 'lecture_hall',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 13,
      code: 'FAC-113',
      name: 'Quantum & AI Simulation Suite',
      category: 'Seminar Halls',
      building: 'Turing Hall',
      floor: 4,
      roomNumber: '410',
      capacity: 54,
      description:
        'Interactive computational research seminar room equipped with GPU visualization wall and dual-presenter lecterns.',
      amenities: ['Visualization Wall', 'Dual Lecterns', 'Acoustic Insulation'],
      imageKey: 'computer_lab',
      operationalStatus: 'OPERATIONAL',
    },
    {
      id: 14,
      code: 'FAC-114',
      name: 'Varsity Aquatic & Fitness Studio',
      category: 'Sports Facilities',
      building: 'Athletics Complex',
      floor: 1,
      roomNumber: '122',
      capacity: 85,
      description:
        'Conditioning and indoor athletic training pavilion reserved for university clubs, wellness clinics, and intramural events.',
      amenities: ['Sprung Floor', 'PA System', 'Locker Access'],
      imageKey: 'sports_complex',
      operationalStatus: 'OPERATIONAL',
    },
  ];

  const d0 = shiftDate(today, 0);
  const d1 = shiftDate(today, 1);
  const d2 = shiftDate(today, 2);
  const d3 = shiftDate(today, 3);
  const d4 = shiftDate(today, 4);
  const dm3 = shiftDate(today, -3);
  const dm7 = shiftDate(today, -7);

  const seedBookings: Array<Omit<FirestoreBookingDoc, 'createdAt' | 'updatedAt'>> = [
    {
      id: 1,
      userId: 4,
      userUid: 'seed-faculty-01',
      facilityId: 1,
      bookingDate: d0,
      startTime: '09:00',
      endTime: '11:00',
      purpose: 'CS-401 Distributed Systems Keynote Lecture',
      attendees: 92,
      remarks: 'Requires dual HDMI lectern capture.',
      status: 'APPROVED',
      approvalRemarks: 'Approved for regular curriculum schedule.',
      approvedBy: 1,
      requesterName: 'Prof. Arthur Pendelton',
      requesterRole: 'FACULTY',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 2,
      userId: 5,
      userUid: 'seed-faculty-02',
      facilityId: 3,
      bookingDate: d0,
      startTime: '13:00',
      endTime: '15:00',
      purpose: 'Applied Mathematics Graduate Colloquium',
      attendees: 48,
      remarks: null,
      status: 'APPROVED',
      approvalRemarks: 'Approved.',
      approvedBy: 1,
      requesterName: 'Dr. Priya Nair',
      requesterRole: 'FACULTY',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 3,
      userId: 2,
      userUid: 'seed-student-01',
      facilityId: 2,
      bookingDate: d1,
      startTime: '14:00',
      endTime: '16:00',
      purpose: 'ACM Algorithms & Systems Study Sprint',
      attendees: 28,
      remarks: 'Need Linux workstation image active.',
      status: 'PENDING',
      approvalRemarks: null,
      approvedBy: null,
      requesterName: 'Maya Lin',
      requesterRole: 'STUDENT',
      approverName: null,
    },
    {
      id: 4,
      userId: 3,
      userUid: 'seed-student-02',
      facilityId: 8,
      bookingDate: d1,
      startTime: '10:00',
      endTime: '12:00',
      purpose: 'Autonomous Rover Capstone Integration',
      attendees: 18,
      remarks: null,
      status: 'PENDING',
      approvalRemarks: null,
      approvedBy: null,
      requesterName: 'Liam Patel',
      requesterRole: 'STUDENT',
      approverName: null,
    },
    {
      id: 5,
      userId: 4,
      userUid: 'seed-faculty-01',
      facilityId: 5,
      bookingDate: d2,
      startTime: '16:00',
      endTime: '18:30',
      purpose: 'Annual Engineering Research Symposium',
      attendees: 310,
      remarks: 'Stage wireless mics and live stream requested.',
      status: 'APPROVED',
      approvalRemarks: 'AV team notified.',
      approvedBy: 1,
      requesterName: 'Prof. Arthur Pendelton',
      requesterRole: 'FACULTY',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 6,
      userId: 2,
      userUid: 'seed-student-01',
      facilityId: 12,
      bookingDate: d2,
      startTime: '11:00',
      endTime: '13:00',
      purpose: 'Senior Thesis Design Review',
      attendees: 8,
      remarks: null,
      status: 'APPROVED',
      approvalRemarks: 'Approved.',
      approvedBy: 1,
      requesterName: 'Maya Lin',
      requesterRole: 'STUDENT',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 7,
      userId: 5,
      userUid: 'seed-faculty-02',
      facilityId: 4,
      bookingDate: d3,
      startTime: '09:30',
      endTime: '11:00',
      purpose: 'Faculty Curriculum Review Committee',
      attendees: 16,
      remarks: null,
      status: 'PENDING',
      approvalRemarks: null,
      approvedBy: null,
      requesterName: 'Dr. Priya Nair',
      requesterRole: 'FACULTY',
      approverName: null,
    },
    {
      id: 8,
      userId: 3,
      userUid: 'seed-student-02',
      facilityId: 7,
      bookingDate: d3,
      startTime: '17:00',
      endTime: '19:00',
      purpose: 'Inter-Departmental Badminton Qualifier',
      attendees: 110,
      remarks: null,
      status: 'APPROVED',
      approvalRemarks: 'Approved with athletics supervision.',
      approvedBy: 1,
      requesterName: 'Liam Patel',
      requesterRole: 'STUDENT',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 9,
      userId: 2,
      userUid: 'seed-student-01',
      facilityId: 1,
      bookingDate: d0,
      startTime: '09:30',
      endTime: '11:30',
      purpose: 'Student Robotics Club General Assembly',
      attendees: 70,
      remarks: null,
      status: 'REJECTED',
      approvalRemarks: 'Conflicts with scheduled CS-401 Distributed Systems lecture.',
      approvedBy: 1,
      requesterName: 'Maya Lin',
      requesterRole: 'STUDENT',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 10,
      userId: 3,
      userUid: 'seed-student-02',
      facilityId: 6,
      bookingDate: d4,
      startTime: '15:00',
      endTime: '16:30',
      purpose: 'CAD Design Team Sync',
      attendees: 10,
      remarks: null,
      status: 'CANCELLED',
      approvalRemarks: 'Cancelled by requester due to schedule shift.',
      approvedBy: null,
      requesterName: 'Liam Patel',
      requesterRole: 'STUDENT',
      approverName: null,
    },
    {
      id: 11,
      userId: 4,
      userUid: 'seed-faculty-01',
      facilityId: 9,
      bookingDate: dm3,
      startTime: '10:00',
      endTime: '12:00',
      purpose: 'Ethics in Computing Guest Seminar',
      attendees: 34,
      remarks: null,
      status: 'COMPLETED',
      approvalRemarks: 'Completed on schedule.',
      approvedBy: 1,
      requesterName: 'Prof. Arthur Pendelton',
      requesterRole: 'FACULTY',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 12,
      userId: 5,
      userUid: 'seed-faculty-02',
      facilityId: 11,
      bookingDate: dm7,
      startTime: '14:00',
      endTime: '16:00',
      purpose: 'Departmental Research Grant Briefing',
      attendees: 14,
      remarks: null,
      status: 'COMPLETED',
      approvalRemarks: 'Approved.',
      approvedBy: 1,
      requesterName: 'Dr. Priya Nair',
      requesterRole: 'FACULTY',
      approverName: 'Dr. Elena Vance',
    },
    {
      id: 13,
      userId: 2,
      userUid: 'seed-student-01',
      facilityId: 13,
      bookingDate: d2,
      startTime: '15:00',
      endTime: '17:00',
      purpose: 'AI Systems Reading Group Workshop',
      attendees: 36,
      remarks: null,
      status: 'PENDING',
      approvalRemarks: null,
      approvedBy: null,
      requesterName: 'Maya Lin',
      requesterRole: 'STUDENT',
      approverName: null,
    },
  ];

  const seedMaintenance: Array<Omit<FirestoreMaintenanceDoc, 'createdAt' | 'updatedAt'>> = [
    {
      id: 1,
      reportedBy: 2,
      reporterUid: 'seed-student-01',
      facilityId: 2,
      title: 'Workstation 12 Ethernet link drops under load',
      description: 'Wall jack 204-B12 intermittently resets to 100Mbps and drops SSH connections during lab builds.',
      category: 'Networking',
      priority: 'HIGH',
      status: 'ASSIGNED',
      assignedTo: 6,
      assigneeUid: 'seed-staff-01',
      reporterName: 'Maya Lin',
      assigneeName: 'Marcus Chen',
      resolutionRemarks: null,
      attachmentNote: 'Port switch label #SW-204-12',
      reportedDate: d0,
    },
    {
      id: 2,
      reportedBy: 4,
      reporterUid: 'seed-faculty-01',
      facilityId: 1,
      title: 'Left-hand 4K projector lamp flicker',
      description: 'Primary left projection array dims noticeably after 20 minutes of continuous lecture capture.',
      category: 'Electrical',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      assignedTo: 6,
      assigneeUid: 'seed-staff-01',
      reporterName: 'Prof. Arthur Pendelton',
      assigneeName: 'Marcus Chen',
      resolutionRemarks: null,
      attachmentNote: null,
      reportedDate: dm3,
    },
    {
      id: 3,
      reportedBy: 5,
      reporterUid: 'seed-faculty-02',
      facilityId: 10,
      title: 'Negative pressure HVAC alarm in Wet Lab',
      description: 'Fume hood differential airflow sensor triggers low-flow warning when bay 2 sash is raised.',
      category: 'Air Conditioning',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      assignedTo: 7,
      assigneeUid: 'seed-staff-02',
      reporterName: 'Dr. Priya Nair',
      assigneeName: 'Elena Rodriguez',
      resolutionRemarks: null,
      attachmentNote: 'Room kept offline until recalibration completes.',
      reportedDate: dm3,
    },
    {
      id: 4,
      reportedBy: 3,
      reporterUid: 'seed-student-02',
      facilityId: 8,
      title: 'Soldering station exhaust valve stiffness',
      description: 'Overhead extraction arm valve on bench 4 requires replacement damper hinge.',
      category: 'Infrastructure',
      priority: 'LOW',
      status: 'OPEN',
      assignedTo: null,
      assigneeUid: null,
      reporterName: 'Liam Patel',
      assigneeName: null,
      resolutionRemarks: null,
      attachmentNote: null,
      reportedDate: d0,
    },
    {
      id: 5,
      reportedBy: 2,
      reporterUid: 'seed-student-01',
      facilityId: 12,
      title: 'Acoustic door latch misalignment',
      description: 'Study pod entry door does not latch smoothly without firm pressure.',
      category: 'Furniture',
      priority: 'LOW',
      status: 'RESOLVED',
      assignedTo: 7,
      assigneeUid: 'seed-staff-02',
      reporterName: 'Maya Lin',
      assigneeName: 'Elena Rodriguez',
      resolutionRemarks: 'Adjusted strike plate and lubricated hinges; verified smooth latching.',
      attachmentNote: null,
      reportedDate: dm7,
    },
    {
      id: 6,
      reportedBy: 4,
      reporterUid: 'seed-faculty-01',
      facilityId: 5,
      title: 'Stage wireless lapel channel 3 interference',
      description: 'Occasional RF static heard on lapel receiver unit 3 during symposium rehearsals.',
      category: 'Electrical',
      priority: 'HIGH',
      status: 'OPEN',
      assignedTo: null,
      assigneeUid: null,
      reporterName: 'Prof. Arthur Pendelton',
      assigneeName: null,
      resolutionRemarks: null,
      attachmentNote: null,
      reportedDate: d0,
    },
    {
      id: 7,
      reportedBy: 5,
      reporterUid: 'seed-faculty-02',
      facilityId: 3,
      title: 'Conference table power grommet loose',
      description: 'Center floor box power module needs securing bracket tightened.',
      category: 'Electrical',
      priority: 'MEDIUM',
      status: 'CLOSED',
      assignedTo: 6,
      assigneeUid: 'seed-staff-01',
      reporterName: 'Dr. Priya Nair',
      assigneeName: 'Marcus Chen',
      resolutionRemarks: 'Replaced retaining clip and tested GFCI outlets.',
      attachmentNote: null,
      reportedDate: dm7,
    },
    {
      id: 8,
      reportedBy: 3,
      reporterUid: 'seed-student-02',
      facilityId: 7,
      title: 'Water fountain pressure drop near West entrance',
      description: 'Bottle-fill dispenser flow rate has dropped noticeably since Monday.',
      category: 'Plumbing',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      assignedTo: 7,
      assigneeUid: 'seed-staff-02',
      reporterName: 'Liam Patel',
      assigneeName: 'Elena Rodriguez',
      resolutionRemarks: 'Replaced sediment cartridge and flushed supply line.',
      attachmentNote: null,
      reportedDate: dm3,
    },
  ];

  const seedNotifications: Array<Omit<FirestoreNotificationDoc, 'createdAt'>> = [
    {
      id: 1,
      userId: 4,
      userUid: 'seed-faculty-01',
      title: 'Booking Approved: Turing Lecture Theatre',
      message: `Your CS-401 lecture reservation on ${d0} (09:00–11:00) has been approved.`,
      type: 'BOOKING',
      isRead: false,
    },
    {
      id: 2,
      userId: 6,
      userUid: 'seed-staff-01',
      title: 'Maintenance Task Assigned: FAC-102',
      message: 'You have been assigned "Workstation 12 Ethernet link drops under load" in Systems & Cloud Lab A.',
      type: 'MAINTENANCE',
      isRead: false,
    },
    {
      id: 3,
      userId: 2,
      userUid: 'seed-student-01',
      title: 'Booking Rejected: Turing Lecture Theatre',
      message: `Your request on ${d0} conflicted with an approved curriculum lecture.`,
      type: 'BOOKING',
      isRead: true,
    },
    {
      id: 4,
      userId: 1,
      userUid: 'seed-admin-01',
      title: 'New Booking Requests Awaiting Review',
      message: '4 room booking requests are currently queued in Admin Approvals.',
      type: 'SYSTEM',
      isRead: false,
    },
  ];

  const ops: Array<{
    type: 'set';
    collection: string;
    id: string;
    data: Record<string, FieldInputValue>;
  }> = [];

  for (const u of seedUsers) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.users,
      id: u.uid,
      data: { ...u, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
    });
    if (u.role === 'ADMIN') {
      ops.push({
        type: 'set',
        collection: COLLECTIONS.admins,
        id: u.uid,
        data: { uid: u.uid, userId: u.id, grantedAt: SERVER_TIMESTAMP },
      });
    }
  }

  for (const f of seedFacilities) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.facilities,
      id: String(f.id),
      data: { ...f, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
    });
  }

  const lockMap = new Map<
    string,
    { facilityId: number; bookingDate: string; approvedSlots: ApprovedSlotLock[] }
  >();
  for (const b of seedBookings) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.bookings,
      id: String(b.id),
      data: { ...b, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
    });
    if (b.status === 'APPROVED') {
      const lockId = getFacilityLockId(b.facilityId, b.bookingDate);
      const existing = lockMap.get(lockId) || {
        facilityId: b.facilityId,
        bookingDate: b.bookingDate,
        approvedSlots: [],
      };
      existing.approvedSlots.push({
        bookingId: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        purpose: b.purpose,
      });
      lockMap.set(lockId, existing);
    }
  }

  for (const [lockId, lockDoc] of lockMap.entries()) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.facilityLocks,
      id: lockId,
      data: { ...lockDoc, updatedAt: SERVER_TIMESTAMP },
    });
  }

  for (const m of seedMaintenance) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.maintenanceRequests,
      id: String(m.id),
      data: { ...m, createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP },
    });
  }

  for (const n of seedNotifications) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.notifications,
      id: String(n.id),
      data: { ...n, createdAt: SERVER_TIMESTAMP },
    });
  }

  const existingAudit = await client.getDoc<FirestoreAuditLogDoc>(
    COLLECTIONS.auditLogs,
    '1',
    authToken
  );
  if (!existingAudit.exists) {
    ops.push({
      type: 'set',
      collection: COLLECTIONS.auditLogs,
      id: '1',
      data: {
        id: 1,
        actorId: 1,
        actorUid: 'seed-admin-01',
        actorName: 'Dr. Elena Vance',
        action: 'SEED_SCRIPT_COMPLETED',
        entityType: 'SYSTEM',
        entityId: 1,
        details: 'Initialized Smart Campus Firestore database with demonstration records.',
        timestamp: SERVER_TIMESTAMP,
      },
    });
  }

  // Preserve user counter if real user already claimed ID >= 8
  const existingUserCounter = await client.getDoc<{ nextId: number }>(
    COLLECTIONS.counters,
    COLLECTIONS.users,
    authToken
  );
  const nextUserId = existingUserCounter.exists
    ? Math.max(8, Number(existingUserCounter.data?.nextId || 8))
    : 8;

  ops.push(
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.users, data: { nextId: nextUserId } },
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.facilities, data: { nextId: 15 } },
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.bookings, data: { nextId: 14 } },
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.maintenanceRequests, data: { nextId: 9 } },
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.notifications, data: { nextId: 5 } },
    { type: 'set', collection: COLLECTIONS.counters, id: COLLECTIONS.auditLogs, data: { nextId: 2 } }
  );

  const nonFacilityOps = ops.filter((op) => op.collection !== COLLECTIONS.facilities);
  const facilityOps = ops.filter((op) => op.collection === COLLECTIONS.facilities);
  const orderedOps = [...nonFacilityOps, ...facilityOps];

  const CHUNK_SIZE = 10;
  for (let i = 0; i < orderedOps.length; i += CHUNK_SIZE) {
    const chunk = orderedOps.slice(i, i + CHUNK_SIZE);
    await client.commitBatch(chunk, authToken);
  }
  seedDone = true;
}
