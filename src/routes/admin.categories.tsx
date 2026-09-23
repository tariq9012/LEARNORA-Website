import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, DataTable, FormField, Input, Modal, Textarea } from "@/components/ui/kit";
import { categories as seed, type Category } from "@/data/mock";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Learnora admin" },
      { name: "description", content: "Create and organise the categories courses are filed under on Learnora." },
      { property: "og:title", content: "Categories — Learnora admin" },
      { property: "og:description", content: "Learnora category management." },
    ],
  }),
  component: AdminCategories,
});

function AdminCategories() {
  const [rows, setRows] = useState<Category[]>(seed);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");

  const add = () => {
    if (!name.trim()) return;
    setRows((p) => [
      ...p,
      {
        ...(p[0] as Category),
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        blurb: blurb || "New category",
        courses: 0,
      },
    ]);
    setName("");
    setBlurb("");
    setOpen(false);
  };

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Categories"
        description="Categories drive browsing, filtering and recommendations."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> New category
          </Button>
        }
      />

      <DataTable<Category & { id: string }>
        caption="Course categories"
        rows={rows.map((c) => ({ ...c, id: c.slug }))}
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
          { key: "blurb", header: "Description", render: (c) => <span className="text-muted-foreground">{c.blurb}</span> },
          { key: "courses", header: "Courses", render: (c) => c.courses },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (c) => (
              <button
                aria-label={`Delete ${c.name}`}
                onClick={() => setRows((p) => p.filter((x) => x.slug !== c.slug))}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 size={15} />
              </button>
            ),
          },
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="New category">
        <div className="space-y-4">
          <FormField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud Engineering" />
          </FormField>
          <FormField label="Short description">
            <Textarea rows={3} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={add}>Create category</Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
