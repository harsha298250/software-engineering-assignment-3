import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CalendarPlus,
  CalendarCheck,
  Wrench,
  ClipboardList,
  ShieldCheck,
  Users,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Search,
  Sun,
  Moon,
  Menu,
  X,
  ChevronDown,
  Check,
  HardHat,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useTheme } from '../contexts/ThemeContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { AppNotification } from '../shared/types.ts';
import { formatRoleLabel } from './StatusText.tsx';

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayout({
  title,
  subtitle,
  actions,
  children,
}: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<{
        notifications: AppNotification[];
        unreadCount: number;
      }>('/api/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent background fetch failure
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    navigate(trimmed ? `/facilities?search=${encodeURIComponent(trimmed)}` : '/facilities');
    setMobileOpen(false);
  };

  const markSingleRead = async (id: number) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'MAINTENANCE_STAFF';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-[#0F2342] text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]'
        : 'text-slate-700 hover:bg-[#F3EFE7] hover:text-[#0F2342] dark:text-slate-300 dark:hover:bg-[#16233B] dark:hover:text-[#F5F2EB]'
    }`;

  const renderSidebarLinks = () => (
    <div className="flex flex-1 flex-col justify-between overflow-y-auto px-3 py-4">
      <div className="space-y-6">
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Campus Workspace
          </p>
          <nav className="space-y-1">
            <NavLink to="/dashboard" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/facilities" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <Building2 className="h-4 w-4 shrink-0" />
              <span>Facilities</span>
            </NavLink>
            <NavLink to="/bookings/new" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <CalendarPlus className="h-4 w-4 shrink-0" />
              <span>Room Bookings</span>
            </NavLink>
            <NavLink to="/bookings/mine" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <CalendarCheck className="h-4 w-4 shrink-0" />
              <span>My Bookings</span>
            </NavLink>
            <NavLink to="/maintenance/new" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <Wrench className="h-4 w-4 shrink-0" />
              <span>Maintenance</span>
            </NavLink>
            <NavLink to="/maintenance/mine" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>My Requests</span>
            </NavLink>
          </nav>
        </div>

        {(isAdmin || isStaff) && (
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
              Operations & Control
            </p>
            <nav className="space-y-1">
              {(isStaff || isAdmin) && (
                <NavLink
                  to="/staff/maintenance"
                  className={navLinkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  <HardHat className="h-4 w-4 shrink-0" />
                  <span>Staff Maintenance</span>
                </NavLink>
              )}
              {isAdmin && (
                <>
                  <NavLink
                    to="/admin/approvals"
                    className={navLinkClass}
                    onClick={() => setMobileOpen(false)}
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Booking Approvals</span>
                  </NavLink>
                  <NavLink
                    to="/admin/facilities"
                    className={navLinkClass}
                    onClick={() => setMobileOpen(false)}
                  >
                    <SlidersHorizontal className="h-4 w-4 shrink-0" />
                    <span>Manage Facilities</span>
                  </NavLink>
                  <NavLink
                    to="/admin/users"
                    className={navLinkClass}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Users className="h-4 w-4 shrink-0" />
                    <span>User Management</span>
                  </NavLink>
                </>
              )}
            </nav>
          </div>
        )}

        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            Insights & Account
          </p>
          <nav className="space-y-1">
            <NavLink to="/reports" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span>Reports</span>
            </NavLink>
            <NavLink
              to="/notifications"
              className={navLinkClass}
              onClick={() => setMobileOpen(false)}
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 && (
                <span className="font-mono-tabular text-xs font-semibold opacity-90">
                  {unreadCount}
                </span>
              )}
            </NavLink>
            <NavLink to="/settings" className={navLinkClass} onClick={() => setMobileOpen(false)}>
              <Settings className="h-4 w-4 shrink-0" />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>
      </div>

      <div className="border-t border-[#E5DFD3] pt-3 dark:border-[#1E2E4A]">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  const initials = (user?.fullName || 'SC')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#0F2342] dark:bg-[#09111E] dark:text-[#F5F2EB] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <div className="flex h-16 items-center gap-2.5 border-b border-[#E5DFD3] px-5 dark:border-[#1E2E4A]">
          <Link
            to="/dashboard"
            className="font-display text-lg font-bold tracking-tight text-[#0F2342] dark:text-[#F5F2EB] whitespace-nowrap"
          >
            Smart Campus
          </Link>
        </div>
        {renderSidebarLinks()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex w-72 max-w-[85vw] flex-col bg-white dark:bg-[#101B2E] border-r border-[#E5DFD3] dark:border-[#1E2E4A]">
            <div className="flex h-16 items-center justify-between border-b border-[#E5DFD3] px-5 dark:border-[#1E2E4A]">
              <span className="font-display text-lg font-bold">Smart Campus</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderSidebarLinks()}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#E5DFD3] bg-[#FAF8F5]/95 px-4 backdrop-blur-sm sm:px-6 dark:border-[#1E2E4A] dark:bg-[#09111E]/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-[#E5DFD3] p-2 text-[#0F2342] hover:bg-white lg:hidden dark:border-[#1E2E4A] dark:text-[#F5F2EB] dark:hover:bg-[#101B2E]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate font-display text-lg sm:text-xl font-semibold text-[#0F2342] dark:text-[#F5F2EB]">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Global Search */}
            <form onSubmit={handleGlobalSearch} className="hidden md:flex items-center relative">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms or buildings..."
                aria-label="Global facility search"
                className="w-56 lg:w-64 rounded-lg border border-[#E5DFD3] bg-white py-1.5 pl-9 pr-3 text-sm text-[#0F2342] placeholder:text-slate-400 focus:border-[#0F2342] focus:outline-none dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB] dark:focus:border-[#EAB308]"
              />
            </form>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DFD3] bg-white text-[#0F2342] transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB] dark:hover:bg-[#16233B]"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Notification Bell */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setBellOpen((o) => !o);
                  fetchNotifications();
                }}
                aria-label="Open notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DFD3] bg-white text-[#0F2342] transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB] dark:hover:bg-[#16233B]"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="font-mono-tabular absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-md bg-[#0F2342] px-1 text-[10px] font-bold text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#E5DFD3] bg-white p-3 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E] z-50">
                  <div className="flex items-center justify-between border-b border-[#E5DFD3] pb-2 dark:border-[#1E2E4A]">
                    <span className="text-sm font-semibold">Notifications</span>
                    <Link
                      to="/notifications"
                      onClick={() => setBellOpen(false)}
                      className="text-xs font-medium text-[#2B4C7E] hover:underline dark:text-[#60A5FA]"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No notifications yet.
                      </p>
                    ) : (
                      notifications.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg p-2.5 text-xs transition-colors ${
                            item.isRead
                              ? 'bg-transparent text-slate-600 dark:text-slate-400'
                              : 'bg-[#FAF8F5] text-[#0F2342] dark:bg-[#16233B] dark:text-[#F5F2EB]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold leading-snug">{item.title}</p>
                            {!item.isRead && (
                              <button
                                type="button"
                                onClick={() => markSingleRead(item.id)}
                                title="Mark as read"
                                className="shrink-0 rounded p-0.5 text-slate-500 hover:text-[#0F2342] dark:hover:text-[#EAB308]"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 opacity-85">{item.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-2 py-1.5 text-left transition-colors hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:hover:bg-[#16233B]"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName}
                    referrerPolicy="no-referrer"
                    className="h-6 w-6 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0F2342] text-xs font-semibold text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]">
                    {initials}
                  </div>
                )}
                <div className="hidden sm:block max-w-[130px]">
                  <p className="truncate text-xs font-semibold leading-tight">
                    {user?.fullName}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {formatRoleLabel(user?.role || 'STUDENT')}
                  </p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#E5DFD3] bg-white p-2 shadow-xl dark:border-[#1E2E4A] dark:bg-[#101B2E] z-50">
                  <div className="border-b border-[#E5DFD3] px-2.5 py-2 dark:border-[#1E2E4A]">
                    <p className="truncate text-sm font-semibold">{user?.fullName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user?.email}
                    </p>
                  </div>
                  <div className="mt-1 space-y-1">
                    <Link
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-[#F3EFE7] dark:hover:bg-[#16233B]"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Profile & Settings</span>
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* First-time profile completion banner */}
        {user && !user.profileCompleted && (
          <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs sm:px-6 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
              <p className="text-amber-900 dark:text-amber-200">
                Welcome to Smart Campus. Confirm your academic department and campus profile details.
              </p>
              <Link
                to="/register"
                className="font-semibold text-[#0F2342] underline dark:text-[#EAB308]"
              >
                Complete Profile
              </Link>
            </div>
          </div>
        )}

        {/* Subheader & Page Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {(subtitle || actions) && (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {subtitle && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
              )}
              {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
