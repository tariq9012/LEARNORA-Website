import { useState } from "react";
import { Link, useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { Menu, X, Search, LogOut, LayoutDashboard } from "lucide-react";
import { Button, Avatar } from "@/components/ui/kit";
import { Logo } from "@/components/layout/Logo";
import { roleHomePath } from "@/lib/auth-routes";
import { initialsOf } from "@/lib/format";
import { logoutFn } from "@/server/functions/auth";

const links = [
  { to: "/courses", label: "Courses" },
  { to: "/categories", label: "Categories" },
  { to: "/become-instructor", label: "Become an Instructor" },
  { to: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();

  async function handleLogout() {
    setOpen(false);
    await logoutFn();
    await router.invalidate();
    await navigate({ to: "/" });
  }

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
        <Logo />

        <div className="hidden items-center gap-8 text-sm text-muted-foreground lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="transition-colors hover:text-cream"
              activeProps={{ className: "text-cream" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/courses"
            aria-label="Search courses"
            className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:text-cream sm:block"
          >
            <Search size={18} />
          </Link>

          {user ? (
            <>
              <Link
                to={roleHomePath(user.role)}
                className="hidden items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-cream sm:flex"
              >
                <Avatar initials={initialsOf(user.name)} src={user.avatarUrl} size="sm" />
                <span className="max-w-[10ch] truncate">{user.name}</span>
              </Link>
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:text-cream sm:block"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden text-sm text-muted-foreground transition-colors hover:text-cream sm:inline"
              >
                Log in
              </Link>
              <Link to="/register">
                <Button variant="cream" size="md">
                  Get started
                </Button>
              </Link>
            </>
          )}

          <button
            className="rounded-md p-2 text-muted-foreground hover:text-cream lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-ink px-6 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-panel hover:text-cream"
              >
                {l.label}
              </Link>
            ))}

            {user ? (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Link to={roleHomePath(user.role)} onClick={() => setOpen(false)}>
                  <Button variant="outline" block>
                    <LayoutDashboard size={15} /> Dashboard
                  </Button>
                </Link>
                <Button block onClick={handleLogout}>
                  <LogOut size={15} /> Log out
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Link to="/login" onClick={() => setOpen(false)}>
                  <Button variant="outline" block>
                    Log in
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setOpen(false)}>
                  <Button block>Sign up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
