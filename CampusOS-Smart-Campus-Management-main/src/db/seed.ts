import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from './index.ts';
import {
  auditLogs,
  bookings,
  facilities,
  maintenanceRequests,
  notifications,
  users,
} from './schema.ts';

async function runSeed() {
  console.log('Seeding Smart Campus PostgreSQL database...');

  const seedUsers = [
    {
      uid: 'seed-admin-01',
      fullName: 'Dr. Elena Vance',
      email: 'elena.vance@northbridge.edu',
      department: 'Campus Operations & Estates',
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-student-01',
      fullName: 'Maya Lin',
      email: 'maya.lin@northbridge.edu',
      department: 'Computer Science',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-student-02',
      fullName: 'Liam Patel',
      email: 'liam.patel@northbridge.edu',
      department: 'Mechanical Engineering',
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-faculty-01',
      fullName: 'Prof. Arthur Pendelton',
      email: 'a.pendelton@northbridge.edu',
      department: 'School of Computing',
      role: 'FACULTY',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-faculty-02',
      fullName: 'Dr. Priya Nair',
      email: 'p.nair@northbridge.edu',
      department: 'Applied Mathematics',
      role: 'FACULTY',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-staff-01',
      fullName: 'Marcus Chen',
      email: 'm.chen@northbridge.edu',
      department: 'Facilities Maintenance — Electrical & AV',
      role: 'MAINTENANCE_STAFF',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
    {
      uid: 'seed-staff-02',
      fullName: 'Elena Rodriguez',
      email: 'e.rodriguez@northbridge.edu',
      department: 'Facilities Maintenance — HVAC & Plumbing',
      role: 'MAINTENANCE_STAFF',
      accountStatus: 'ACTIVE',
      profileCompleted: true,
    },
  ];

  for (const u of seedUsers) {
    await db.insert(users).values(u).onConflictDoNothing({ target: users.uid });
  }

  const seedFacilities = [
    {
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
  ];

  for (const f of seedFacilities) {
    await db.insert(facilities).values(f).onConflictDoNothing({ target: facilities.code });
  }

  const existingBookings = await db.select().from(bookings).limit(1);
  if (existingBookings.length === 0) {
    const [student] = await db.select().from(users).where(eq(users.uid, 'seed-student-01'));
    const [faculty] = await db.select().from(users).where(eq(users.uid, 'seed-faculty-01'));
    const [admin] = await db.select().from(users).where(eq(users.uid, 'seed-admin-01'));
    const [staff] = await db.select().from(users).where(eq(users.uid, 'seed-staff-01'));
    const [fac101] = await db.select().from(facilities).where(eq(facilities.code, 'FAC-101'));
    const [fac102] = await db.select().from(facilities).where(eq(facilities.code, 'FAC-102'));

    if (student && faculty && admin && fac101 && fac102) {
      await db.insert(bookings).values([
        {
          userId: faculty.id,
          facilityId: fac101.id,
          bookingDate: '2026-11-18',
          startTime: '09:00',
          endTime: '11:00',
          purpose: 'Distributed Systems Lecture',
          attendees: 85,
          status: 'APPROVED',
          approvedBy: admin.id,
          approvalRemarks: 'Approved.',
        },
        {
          userId: student.id,
          facilityId: fac102.id,
          bookingDate: '2026-11-19',
          startTime: '14:00',
          endTime: '16:00',
          purpose: 'Algorithms Study Group',
          attendees: 20,
          status: 'PENDING',
        },
      ]);

      await db.insert(maintenanceRequests).values({
        reportedBy: student.id,
        facilityId: fac102.id,
        title: 'Network port link drop at workstation 12',
        description: 'Ethernet drop disconnects intermittently under sustained upload load.',
        category: 'Networking',
        priority: 'HIGH',
        status: staff ? 'ASSIGNED' : 'OPEN',
        assignedTo: staff?.id ?? null,
        reportedDate: '2026-11-12',
      });

      await db.insert(notifications).values({
        userId: faculty.id,
        title: 'Booking Approved: Turing Lecture Theatre',
        message: 'Your lecture booking for 2026-11-18 has been approved.',
        type: 'BOOKING',
      });

      await db.insert(auditLogs).values({
        actorId: admin.id,
        action: 'SEED_SCRIPT_COMPLETED',
        entityType: 'SYSTEM',
        entityId: 1,
        details: 'Seed script populated campus demonstration records.',
      });
    }
  }

  console.log('Seed completed.');
  await pool.end();
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
