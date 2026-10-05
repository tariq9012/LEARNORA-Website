import { Avatar, Button, DataTable, StatusBadge } from "@/components/ui/kit";
import { formatShortDate, initialsOf } from "@/lib/format";
import type { AdminUserDTO } from "@/server/dto/admin";

const ROLE_LABEL: Record<AdminUserDTO["role"], string> = {
  STUDENT: "Student",
  INSTRUCTOR: "Instructor",
  ADMIN: "Admin",
};

const STATUS_LABEL: Record<AdminUserDTO["status"], string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  BANNED: "Banned",
};

const APPROVAL_LABEL = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

/**
 * Purely presentational (Phase 15): rows come in through props, all
 * fetching / filtering / pagination / mutations live in the route. No mock
 * data, no local state.
 */
export function UserTable({
  users,
  emptyMessage,
  busyUserId,
  onManage,
}: {
  users: AdminUserDTO[];
  emptyMessage: string;
  /** User whose status change is in flight (disables its button). */
  busyUserId?: string | null | undefined;
  onManage: (user: AdminUserDTO) => void;
}) {
  return (
    <DataTable<AdminUserDTO>
      caption="Platform users"
      empty={emptyMessage}
      rows={users}
      columns={[
        {
          key: "name",
          header: "User",
          render: (u) => (
            <div className="flex items-center gap-3">
              <Avatar initials={initialsOf(u.name)} src={u.avatarUrl} size="sm" />
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{u.email}</p>
              </div>
            </div>
          ),
        },
        { key: "role", header: "Role", render: (u) => ROLE_LABEL[u.role] },
        {
          key: "profile",
          header: "Profile",
          render: (u) =>
            u.instructorApproval ? (
              <span className="text-xs">{APPROVAL_LABEL[u.instructorApproval]}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        },
        {
          key: "status",
          header: "Status",
          render: (u) => <StatusBadge status={STATUS_LABEL[u.status]} />,
        },
        { key: "joined", header: "Joined", render: (u) => formatShortDate(u.joinedAt) },
        {
          key: "actions",
          header: "",
          className: "text-right",
          render: (u) =>
            u.statusEditable ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busyUserId === u.id}
                onClick={() => onManage(u)}
                aria-label={`Manage account status for ${u.name}`}
              >
                Manage
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {u.role === "ADMIN" ? "Protected" : "You"}
              </span>
            ),
        },
      ]}
    />
  );
}
