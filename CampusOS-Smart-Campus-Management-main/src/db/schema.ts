import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    department: text('department').default('General Campus').notNull(),
    role: text('role').default('STUDENT').notNull(), // STUDENT | FACULTY | MAINTENANCE_STAFF | ADMIN
    accountStatus: text('account_status').default('ACTIVE').notNull(), // ACTIVE | INACTIVE
    avatarUrl: text('avatar_url'),
    profileCompleted: boolean('profile_completed').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_role').on(table.role),
    index('idx_users_status').on(table.accountStatus),
  ]
);

export const facilities = pgTable(
  'facilities',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    building: text('building').notNull(),
    floor: integer('floor').notNull(),
    roomNumber: text('room_number').notNull(),
    capacity: integer('capacity').notNull(),
    description: text('description').notNull(),
    amenities: jsonb('amenities').$type<string[]>().default([]).notNull(),
    imageKey: text('image_key').default('lecture_hall').notNull(),
    operationalStatus: text('operational_status').default('OPERATIONAL').notNull(), // OPERATIONAL | UNDER_MAINTENANCE | DISABLED
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_facilities_category').on(table.category),
    index('idx_facilities_building').on(table.building),
    index('idx_facilities_status').on(table.operationalStatus),
  ]
);

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    facilityId: integer('facility_id')
      .references(() => facilities.id, { onDelete: 'cascade' })
      .notNull(),
    bookingDate: text('booking_date').notNull(), // YYYY-MM-DD
    startTime: text('start_time').notNull(), // HH:mm
    endTime: text('end_time').notNull(), // HH:mm
    purpose: text('purpose').notNull(),
    attendees: integer('attendees').notNull(),
    remarks: text('remarks'),
    status: text('status').default('PENDING').notNull(), // PENDING | APPROVED | REJECTED | CANCELLED | COMPLETED
    approvalRemarks: text('approval_remarks'),
    approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_bookings_facility_date_status').on(
      table.facilityId,
      table.bookingDate,
      table.status
    ),
    index('idx_bookings_user').on(table.userId),
    index('idx_bookings_status').on(table.status),
  ]
);

export const maintenanceRequests = pgTable(
  'maintenance_requests',
  {
    id: serial('id').primaryKey(),
    reportedBy: integer('reported_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    facilityId: integer('facility_id')
      .references(() => facilities.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    priority: text('priority').default('MEDIUM').notNull(), // LOW | MEDIUM | HIGH | CRITICAL
    status: text('status').default('OPEN').notNull(), // OPEN | ASSIGNED | IN_PROGRESS | RESOLVED | CLOSED
    assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    resolutionRemarks: text('resolution_remarks'),
    attachmentNote: text('attachment_note'),
    reportedDate: text('reported_date').notNull(), // YYYY-MM-DD
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_maintenance_status_priority').on(table.status, table.priority),
    index('idx_maintenance_reporter').on(table.reportedBy),
    index('idx_maintenance_assignee').on(table.assignedTo),
    index('idx_maintenance_facility').on(table.facilityId),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').default('SYSTEM').notNull(), // BOOKING | MAINTENANCE | SYSTEM
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user_read').on(table.userId, table.isRead)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    details: text('details'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_audit_logs_entity').on(table.entityType, table.entityId)]
);

export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings, { relationName: 'bookingRequester' }),
  approvedBookings: many(bookings, { relationName: 'bookingApprover' }),
  reportedMaintenance: many(maintenanceRequests, { relationName: 'maintenanceReporter' }),
  assignedMaintenance: many(maintenanceRequests, { relationName: 'maintenanceAssignee' }),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const facilitiesRelations = relations(facilities, ({ many }) => ({
  bookings: many(bookings),
  maintenanceRequests: many(maintenanceRequests),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
    relationName: 'bookingRequester',
  }),
  facility: one(facilities, {
    fields: [bookings.facilityId],
    references: [facilities.id],
  }),
  approver: one(users, {
    fields: [bookings.approvedBy],
    references: [users.id],
    relationName: 'bookingApprover',
  }),
}));

export const maintenanceRequestsRelations = relations(maintenanceRequests, ({ one }) => ({
  reporter: one(users, {
    fields: [maintenanceRequests.reportedBy],
    references: [users.id],
    relationName: 'maintenanceReporter',
  }),
  assignee: one(users, {
    fields: [maintenanceRequests.assignedTo],
    references: [users.id],
    relationName: 'maintenanceAssignee',
  }),
  facility: one(facilities, {
    fields: [maintenanceRequests.facilityId],
    references: [facilities.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));
