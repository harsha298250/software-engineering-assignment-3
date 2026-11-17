export type UserRole = 'STUDENT' | 'FACULTY' | 'MAINTENANCE_STAFF' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'INACTIVE';
export type InviteStatus = 'PENDING' | 'CLAIMED' | 'REVOKED';

export interface RoleInvite {
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

export type FacilityCategory =
  | 'Classrooms'
  | 'Computer Laboratories'
  | 'Seminar Halls'
  | 'Conference Rooms'
  | 'Auditoriums'
  | 'Meeting Rooms'
  | 'Sports Facilities'
  | 'Other Campus Resources';

export type OperationalStatus = 'OPERATIONAL' | 'UNDER_MAINTENANCE' | 'DISABLED';

export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

export type MaintenanceCategory =
  | 'Electrical'
  | 'Plumbing'
  | 'Air Conditioning'
  | 'Furniture'
  | 'Networking'
  | 'Computer Equipment'
  | 'Cleaning'
  | 'Infrastructure'
  | 'Other';

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MaintenanceStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export const FACILITY_CATEGORIES: FacilityCategory[] = [
  'Classrooms',
  'Computer Laboratories',
  'Seminar Halls',
  'Conference Rooms',
  'Auditoriums',
  'Meeting Rooms',
  'Sports Facilities',
  'Other Campus Resources',
];

export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  'Electrical',
  'Plumbing',
  'Air Conditioning',
  'Furniture',
  'Networking',
  'Computer Equipment',
  'Cleaning',
  'Infrastructure',
  'Other',
];

export const MAINTENANCE_PRIORITIES: MaintenancePriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
];

export const USER_ROLES: UserRole[] = [
  'STUDENT',
  'FACULTY',
  'MAINTENANCE_STAFF',
  'ADMIN',
];

export interface AppUser {
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

export interface Facility {
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

export interface BookingWithRelations {
  id: number;
  userId: number;
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
  createdAt: string;
  updatedAt: string;
  facilityName?: string;
  facilityCode?: string;
  facilityBuilding?: string;
  facilityRoomNumber?: string;
  facilityCapacity?: number;
  requesterName?: string;
  requesterEmail?: string;
  requesterRole?: UserRole;
  approverName?: string | null;
}

export interface MaintenanceWithRelations {
  id: number;
  reportedBy: number;
  facilityId: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo: number | null;
  resolutionRemarks: string | null;
  attachmentNote: string | null;
  reportedDate: string;
  createdAt: string;
  updatedAt: string;
  facilityName?: string;
  facilityCode?: string;
  facilityBuilding?: string;
  reporterName?: string;
  reporterEmail?: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
}

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: 'BOOKING' | 'MAINTENANCE' | 'SYSTEM';
  isRead: boolean;
  createdAt: string;
}
