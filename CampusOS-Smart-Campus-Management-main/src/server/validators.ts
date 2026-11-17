import { z } from 'zod';
import {
  FACILITY_CATEGORIES,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  USER_ROLES,
} from '../shared/types.ts';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const loginSchema = z.object({
  expectedRole: z.enum(USER_ROLES as [string, ...string[]]).optional(),
});

export const registerProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  department: z.string().trim().min(2, 'Department is required').max(100),
  // Public registration can never grant ADMIN or MAINTENANCE_STAFF
  requestedRole: z.enum(['STUDENT', 'FACULTY']).optional(),
});

export const facilitySchema = z.object({
  code: z.string().trim().min(3).max(20),
  name: z.string().trim().min(3).max(120),
  category: z.enum(FACILITY_CATEGORIES as [string, ...string[]]),
  building: z.string().trim().min(2).max(100),
  floor: z.coerce.number().int().min(-2).max(50),
  roomNumber: z.string().trim().min(1).max(30),
  capacity: z.coerce.number().int().min(1).max(5000),
  description: z.string().trim().min(10).max(1500),
  amenities: z.array(z.string().trim().min(1).max(80)).default([]),
  imageKey: z
    .enum(['lecture_hall', 'computer_lab', 'auditorium', 'sports_complex'])
    .default('lecture_hall'),
  operationalStatus: z
    .enum(['OPERATIONAL', 'UNDER_MAINTENANCE', 'DISABLED'])
    .default('OPERATIONAL'),
});

export const createBookingSchema = z
  .object({
    facilityId: z.coerce.number().int().positive(),
    bookingDate: z.string().regex(dateRegex, 'Booking date must be in YYYY-MM-DD format'),
    startTime: z.string().regex(timeRegex, 'Start time must be in HH:mm format'),
    endTime: z.string().regex(timeRegex, 'End time must be in HH:mm format'),
    purpose: z.string().trim().min(5, 'Purpose must be at least 5 characters').max(250),
    attendees: z.coerce.number().int().min(1, 'At least 1 attendee is required'),
    remarks: z.string().trim().max(500).optional().nullable(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'Start time must be earlier than end time',
    path: ['endTime'],
  });

export const approveBookingSchema = z.object({
  approvalRemarks: z.string().trim().max(500).optional().nullable(),
});

export const rejectBookingSchema = z.object({
  approvalRemarks: z
    .string()
    .trim()
    .min(3, 'Please provide a reason for rejecting this booking')
    .max(500),
});

export const createMaintenanceSchema = z.object({
  facilityId: z.coerce.number().int().positive(),
  title: z.string().trim().min(5, 'Issue title must be at least 5 characters').max(160),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  category: z.enum(MAINTENANCE_CATEGORIES as [string, ...string[]]),
  priority: z.enum(MAINTENANCE_PRIORITIES as [string, ...string[]]).default('MEDIUM'),
  reportedDate: z.string().regex(dateRegex).optional(),
  attachmentNote: z.string().trim().max(300).optional().nullable(),
});

export const assignMaintenanceSchema = z.object({
  assignedTo: z.coerce.number().int().positive(),
  priority: z.enum(MAINTENANCE_PRIORITIES as [string, ...string[]]).optional(),
});

export const updateMaintenanceStatusSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES as [string, ...string[]]),
  resolutionRemarks: z.string().trim().max(1000).optional().nullable(),
});

export const adminUpdateUserSchema = z.object({
  role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
  accountStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  fullName: z.string().trim().min(2).max(100).optional(),
});

export const adminProvisionUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Please enter a valid institutional email address').max(200),
  department: z.string().trim().min(2, 'Department is required').max(120),
  role: z.enum(USER_ROLES as [string, ...string[]]),
});
