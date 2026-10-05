import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Button,
  DataTable,
  FormField,
  Input,
  Modal,
  Pagination,
  SearchBar,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import {
  createCategoryFn,
  getAdminCategoriesFn,
  updateCategoryFn,
} from "@/server/functions/admin-operations";
import type { AdminCategoryDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/categories")({
  loader: async () => ({ list: await getAdminCategoriesFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Categories — Learnora admin" },
      {
        name: "description",
        content: "Create and organise the categories courses are filed under on Learnora.",
      },
      { property: "og:title", content: "Categories — Learnora admin" },
      { property: "og:description", content: "Learnora category management." },
    ],
  }),
  component: AdminCategories,
});

function AdminCategories() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error, reload } = useServerList({
    initial: list,
    initialFilters: { search: "", status: "" },
    fetcher: (p) =>
      getAdminCategoriesFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.status && { status: p.status }),
        },
      }),
  });

  // `editing === null` with `open` true means "create".
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategoryDTO | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setFormError("");
    setOpen(true);
  }

  function openEdit(category: AdminCategoryDTO) {
    setEditing(category);
    setName(category.name);
    setDescription(category.description);
    setFormError("");
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setFormError("");
    const result = editing
      ? await updateCategoryFn({ data: { categoryId: editing.id, name, description } })
      : await createCategoryFn({ data: { name, description } });
    setBusy(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    setOpen(false);
    await reload();
  }

  async function toggleStatus(category: AdminCategoryDTO) {
    setActionError("");
    const result = await updateCategoryFn({
      data: {
        categoryId: category.id,
        status: category.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      },
    });
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    await reload();
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Categories"
        description="Categories are never deleted. Deactivating one hides it from the public catalogue; its courses stay live and reachable."
        action={
          <Button onClick={openCreate}>
            <Plus size={16} /> New category
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search categories"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-44"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>

      {(error || actionError) && (
        <p className="mb-4 text-sm text-destructive">{error || actionError}</p>
      )}

      <DataTable<AdminCategoryDTO>
        caption="Categories"
        empty={loading ? "Loading…" : "No categories match these filters."}
        rows={data.categories}
        columns={[
          {
            key: "name",
            header: "Category",
            render: (c) => (
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">/{c.slug}</p>
              </div>
            ),
          },
          {
            key: "description",
            header: "Description",
            render: (c) => <span className="text-muted-foreground">{c.description || "—"}</span>,
          },
          { key: "courses", header: "Courses", render: (c) => c.courseCount },
          {
            key: "status",
            header: "Status",
            render: (c) => <StatusBadge status={c.status === "ACTIVE" ? "Active" : "Inactive"} />,
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (c) => (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                  <Pencil size={14} /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => void toggleStatus(c)}>
                  {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit category" : "New category"}
        description={
          editing
            ? "The URL slug stays the same when you rename."
            : "A URL slug is generated automatically."
        }
      >
        <div className="space-y-4">
          <FormField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </FormField>
          <FormField label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </FormField>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Save changes" : "Create category"}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
