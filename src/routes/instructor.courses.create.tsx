import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, Card, FormField, Input, Select, Textarea } from "@/components/ui/kit";
import { getCategoriesFn } from "@/server/functions/catalog";
import { createInstructorCourseFn } from "@/server/functions/instructor-course";

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export const Route = createFileRoute("/instructor/courses/create")({
  loader: async () => ({ categories: await getCategoriesFn() }),
  head: () => ({
    meta: [
      { title: "New course — Learnora instructor" },
      { name: "description", content: "Start a new Learnora course draft." },
      { property: "og:title", content: "New course — Learnora instructor" },
      { property: "og:description", content: "Create a new Learnora course." },
    ],
  }),
  component: CreateCourse,
});

function CreateCourse() {
  const { categories } = Route.useLoaderData();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="New course"
        description="Start with the basics. You will add sections, lessons and pricing next."
      />

      <Card className="max-w-[720px] p-6">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (submitting) return;
            setError("");
            setFieldErrors({});

            const data = new FormData(e.currentTarget);
            setSubmitting(true);
            try {
              const result = await createInstructorCourseFn({
                data: {
                  title: data.get("title"),
                  subtitle: data.get("subtitle") || undefined,
                  description: data.get("description") || undefined,
                  categoryId: data.get("categoryId"),
                  level: data.get("level"),
                  language: data.get("language") || "English",
                },
              });
              if (!result.success) {
                setError(result.error);
                setFieldErrors(result.fieldErrors ?? {});
                return;
              }
              await navigate({
                to: "/instructor/courses/$courseId",
                params: { courseId: result.data.id },
              });
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <FormField
            label="Course title"
            htmlFor="title"
            {...(fieldErrors["title"] && { error: fieldErrors["title"] })}
          >
            <Input
              id="title"
              name="title"
              placeholder="Modern React & TypeScript"
              required
              minLength={3}
            />
          </FormField>

          <FormField label="Subtitle" htmlFor="subtitle" hint="One sentence describing the outcome">
            <Input
              id="subtitle"
              name="subtitle"
              placeholder="Build production interfaces with confident types."
            />
          </FormField>

          <FormField label="Description" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={5}
              placeholder="What will students learn and build?"
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Category"
              htmlFor="categoryId"
              {...(fieldErrors["categoryId"] && { error: fieldErrors["categoryId"] })}
            >
              <Select id="categoryId" name="categoryId" required defaultValue="">
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Level" htmlFor="level">
              <Select id="level" name="level" defaultValue="ALL_LEVELS">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Language" htmlFor="language">
              <Input id="language" name="language" defaultValue="English" />
            </FormField>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create draft"}
          </Button>
        </form>
      </Card>
    </DashboardLayout>
  );
}
