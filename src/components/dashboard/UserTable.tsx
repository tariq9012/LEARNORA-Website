import { useState } from "react";
import { Avatar, Button, DataTable, Modal, SearchBar, Select, StatusBadge } from "@/components/ui/kit";
import { users, type PlatformUser, type Role } from "@/data/mock";

export function UserTable({ role }: { role?: Role }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<PlatformUser | null>(null);
  const [suspended, setSuspended] = useState<string[]>([]);

  const rows = users
    .filter((u) => (role ? u.role === role : true))
    .filter((u) => (status === "all" ? true : u.status.toLowerCase() === status))
    .filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar placeholder="Search by name or email" value={q} onChange={setQ} />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>

      <DataTable<PlatformUser>
        caption="Platform users"
        empty="No users match this filter."
        rows={rows}
        columns={[
          {
            key: "name",
            header: "User",
            render: (u) => (
              <div className="flex items-center gap-3">
                <Avatar initials={u.initials} size="sm" />
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{u.email}</p>
                </div>
              </div>
            ),
          },
          { key: "role", header: "Role", render: (u) => <span className="capitalize">{u.role}</span> },
          {
            key: "status",
            header: "Status",
            render: (u) => <StatusBadge status={suspended.includes(u.id) ? "Suspended" : u.status} />,
          },
          { key: "joined", header: "Joined", render: (u) => u.joined },
          { key: "enrollments", header: "Enrolments", render: (u) => u.enrollments },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (u) => (
              <Button variant="outline" size="sm" onClick={() => setSelected(u)}>
                Manage
              </Button>
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "User"}
        description={selected?.email}
      >
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="capitalize">{selected?.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Joined</span>
            <span>{selected?.joined}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Enrolments</span>
            <span>{selected?.enrollments}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (selected) setSuspended((p) => [...p, selected.id]);
              setSelected(null);
            }}
          >
            Suspend account
          </Button>
        </div>
      </Modal>
    </>
  );
}
