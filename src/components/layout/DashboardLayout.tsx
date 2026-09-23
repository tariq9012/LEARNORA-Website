import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BookOpen,
  Compass,
  Heart,
  Award,
  MessageSquare,
  Bell,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  PlusCircle,
  Users,
  Star,
  Wallet,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  FolderTree,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Avatar } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
import { logoutFn } from "@/server/functions/auth";

export type NavItem = { to: string; label: string; icon: LucideIcon };

export const studentNav: NavItem[] = [
  { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/learning", label: "My Learning", icon: BookOpen },
  { to: "/courses", label: "Browse Courses", icon: Compass },
  { to: "/student/wishlist", label: "Wishlist", icon: Heart },
  { to: "/student/certificates", label: "Certificates", icon: Award },
  { to: "/student/purchases", label: "Purchases", icon: CreditCard },
  { to: "/student/messages", label: "Messages", icon: MessageSquare },
  { to: "/student/notifications", label: "Notifications", icon: Bell },
  { to: "/student/profile", label: "Profile", icon: User },
  { to: "/student/settings", label: "Settings", icon: Settings },
];

export const instructorNav: NavItem[] = [
  { to: "/instructor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instructor/courses", label: "My Courses", icon: BookOpen },
  { to: "/instructor/courses/create", label: "Create Course", icon: PlusCircle },
  { to: "/instructor/students", label: "Students", icon: Users },
  { to: "/instructor/reviews", label: "Reviews", icon: Star },
  { to: "/instructor/earnings", label: "Earnings", icon: Wallet },
  { to: "/instructor/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/instructor/messages", label: "Messages", icon: MessageSquare },
  { to: "/instructor/profile", label: "Profile", icon: User },
  { to: "/instructor/settings", label: "Settings", icon: Settings },
];

export const adminNav: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/students", label: "Students", icon: GraduationCap },
  { to: "/admin/instructors", label: "Instructors", icon: User },
  { to: "/admin/courses", label: "Courses", icon: BookOpen },
  { to: "/admin/course-approval", label: "Course Approval", icon: ShieldCheck },
  { to: "/admin/categories", label: "Categories", icon: FolderTree },
  { to: "/admin/enrollments", label: "Enrollments", icon: ClipboardList },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/reviews", label: "Reviews", icon: Star },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart },
  { to: "/admin/certificates", label: "Certificates", icon: Award },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/settings", label: "Platform Settings", icon: Settings },
];

const roleLabels = {
  student: "Student",
  instructor: "Instructor",
  admin: "Administrator",
} as const;

export function DashboardLayout({
  role,
  children,
}: {
  role: "student" | "instructor" | "admin";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const nav = role === "student" ? studentNav : role === "instructor" ? instructorNav : adminNav;
  const roleLabel = roleLabels[role];

  async function handleLogout() {
    setOpen(false);
    await logoutFn();
    await router.invalidate();
    await navigate({ to: "/" });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo withTag={false} />
      </div>
      <p className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {roleLabel}
      </p>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-panel-2 hover:text-cream"
            activeProps={{ className: "bg-brand/15 text-brand-soft ring-1 ring-brand/25" }}
            activeOptions={{ exact: true }}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar
            initials={user ? initialsOf(user.name) : roleLabel.slice(0, 2).toUpperCase()}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name ?? roleLabel}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-panel-2 hover:text-cream"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-panel/60 lg:block">
        {sidebar}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Logo withTag={false} />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-2 text-muted-foreground hover:text-cream"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-panel">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded-md p-2 text-muted-foreground hover:text-cream"
            >
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

export function DashboardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        <h1 className="font-display text-3xl tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
