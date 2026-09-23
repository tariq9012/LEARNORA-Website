import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Archive,
  CheckCircle2,
  Clock3,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { MediaUploadField } from "@/components/course/MediaUpload";
import { getCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/kit";
import { getCategoriesFn } from "@/server/functions/catalog";
import {
  archiveInstructorCourseFn,
  createLessonFn,
  createSectionFn,
  deleteInstructorCourseFn,
  deleteLessonFn,
  deleteSectionFn,
  getInstructorCourseFn,
  reorderLessonsFn,
  reorderSectionsFn,
  submitCourseForReviewFn,
  updateInstructorCourseFn,
  updateLessonFn,
  updateSectionFn,
} from "@/server/functions/instructor-course";
import type { CourseBuilderDTO } from "@/server/dto/instructor-course";
import type { AssetDTO } from "@/server/dto/media";

export const Route = createFileRoute("/instructor/courses/$courseId")({
  loader: async ({ params }) => {
    const [result, categories] = await Promise.all([
      getInstructorCourseFn({ data: { courseId: params.courseId } }),
      getCategoriesFn(),
    ]);
    return { result, categories };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.result.success
          ? `Editing: ${loaderData.result.data.title}`
          : "Course editor",
      },
    ],
  }),
  component: CourseEditor,
});

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const;
const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};
const STATUS_LABEL: Record<CourseBuilderDTO["status"], string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

function CourseEditor() {
  const { result, categories } = Route.useLoaderData();

  if (!result.success) {
    return (
      <DashboardLayout role="instructor">
        <div className="grid place-items-center py-24 text-center">
          <AlertTriangle size={28} className="text-destructive" />
          <p className="mt-4 text-muted-foreground">{result.error}</p>
          <Link to="/instructor/courses" className="mt-4">
            <Button variant="outline">Back to my courses</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return <Builder initial={result.data} categories={categories} />;
}

function Builder({
  initial,
  categories,
}: {
  initial: CourseBuilderDTO;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [course, setCourse] = useState(initial);
  const [error, setError] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    // router.invalidate() alone re-runs the route loader, but Builder's
    // own `course` state (seeded once from the initial loader data via
    // useState) never picks up the new loaderData on its own — so every
    // action (upload, add lesson, submit, archive) looked like it did
    // nothing until a manual page reload. Re-fetching here and setting
    // state directly is what actually updates the screen; invalidating
    // the router loader too keeps things like the tab title in sync.
    const result = await getInstructorCourseFn({ data: { courseId: course.id } });
    if (result.success) setCourse(result.data);
    await router.invalidate();
  }

  async function handleDelete() {
    if (!confirm("Delete this draft permanently? This can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      const result = await deleteInstructorCourseFn({ data: { courseId: course.id } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/instructor/courses" });
    } finally {
      setDeleting(false);
    }
  }

  async function saveMetadata(fields: Record<string, unknown>) {
    setSavingMeta(true);
    setError("");
    try {
      const result = await updateInstructorCourseFn({ data: { courseId: course.id, fields } });
      if (!result.success) {
        setError(result.error);
        return false;
      }
      setCourse((prev) => ({ ...prev, ...fields }) as CourseBuilderDTO);
      return true;
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    setError("");
    try {
      const result = await submitCourseForReviewFn({ data: { courseId: course.id } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this course? It will be removed from the public catalogue.")) return;
    const result = await archiveInstructorCourseFn({ data: { courseId: course.id } });
    if (!result.success) setError(result.error);
    else await refresh();
  }

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title={course.title}
        description={`Slug: /courses/${course.slug}`}
        action={<StatusBadge status={STATUS_LABEL[course.status]} />}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <StatusPanel course={course} onArchive={handleArchive} />

      {course.editable ? (
        <div className="space-y-8">
          <MetadataCard
            course={course}
            categories={categories}
            saving={savingMeta}
            onSave={saveMetadata}
            onThumbnailChange={(asset) => setCourse((prev) => ({ ...prev, thumbnailAsset: asset }))}
            onPreviewChange={(asset) => setCourse((prev) => ({ ...prev, previewAsset: asset }))}
          />
          <PricingCard course={course} saving={savingMeta} onSave={saveMetadata} />
          <CurriculumCard courseId={course.id} sections={course.sections} onChange={refresh} />

          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Ready to publish?</p>
              <p className="text-sm text-muted-foreground">
                Submitting sends this course to Learnora's review queue. You can't edit it while
                it's pending.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={15} /> Delete draft
              </Button>
              <Button onClick={handleSubmitForReview} disabled={submitting}>
                <Send size={15} /> {submitting ? "Submitting…" : "Submit for review"}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <ReadOnlySummary course={course} />
      )}
    </DashboardLayout>
  );
}

function StatusPanel({ course, onArchive }: { course: CourseBuilderDTO; onArchive: () => void }) {
  if (course.status === "REJECTED" && course.rejectionReason) {
    return (
      <Card className="mb-8 border border-destructive/30 bg-destructive/5 p-5">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <X size={16} /> Rejected
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{course.rejectionReason}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Make the changes below, then submit for review again.
        </p>
      </Card>
    );
  }
  if (course.status === "PENDING_REVIEW") {
    return (
      <Card className="mb-8 border border-warn/30 bg-warn/5 p-5">
        <p className="flex items-center gap-2 font-medium text-warn">
          <Clock3 size={16} /> Pending review
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your course is currently under review. Editing is locked until a decision is made.
        </p>
      </Card>
    );
  }
  if (course.status === "PUBLISHED") {
    return (
      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 border border-good/30 bg-good/5 p-5">
        <div>
          <p className="flex items-center gap-2 font-medium text-good">
            <CheckCircle2 size={16} /> Published
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This course is live in the public catalogue.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/courses/$courseId" params={{ courseId: course.slug }}>
            <Button variant="outline" size="sm">
              View public course
            </Button>
          </Link>
          <Button variant="destructive" size="sm" onClick={onArchive}>
            <Archive size={14} /> Archive
          </Button>
        </div>
      </Card>
    );
  }
  if (course.status === "ARCHIVED") {
    return (
      <Card className="mb-8 p-5">
        <p className="font-medium text-muted-foreground">
          Archived — no longer visible in the public catalogue.
        </p>
      </Card>
    );
  }
  return null;
}

function ReadOnlySummary({ course }: { course: CourseBuilderDTO }) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="font-display text-xl tracking-tight">{course.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{course.subtitle}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{course.description}</p>
      </Card>
      <Card className="p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Curriculum
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {course.sections.length} sections ·{" "}
          {course.sections.reduce((n, s) => n + s.lessons.length, 0)} lessons
        </p>
      </Card>
    </div>
  );
}

function MetadataCard({
  course,
  categories,
  saving,
  onSave,
  onThumbnailChange,
  onPreviewChange,
}: {
  course: CourseBuilderDTO;
  categories: { id: string; name: string }[];
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => Promise<boolean>;
  onThumbnailChange: (asset: AssetDTO | null) => void;
  onPreviewChange: (asset: AssetDTO | null) => void;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-lg tracking-tight">Course details</h2>
      <form
        className="mt-5 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          await onSave({
            title: data.get("title"),
            subtitle: data.get("subtitle") || undefined,
            description: data.get("description") || undefined,
            categoryId: data.get("categoryId"),
            level: data.get("level"),
            language: data.get("language"),
          });
        }}
      >
        <FormField label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={course.title} required minLength={3} />
        </FormField>
        <FormField label="Subtitle" htmlFor="subtitle">
          <Input id="subtitle" name="subtitle" defaultValue={course.subtitle} />
        </FormField>
        <FormField label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            rows={5}
            defaultValue={course.description}
          />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Category" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" defaultValue={course.categoryId} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Level" htmlFor="level">
            <Select id="level" name="level" defaultValue={course.level}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Language" htmlFor="language">
            <Input id="language" name="language" defaultValue={course.language} />
          </FormField>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>
      </form>

      <div className="mt-6 grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
        <MediaUploadField
          label="Course thumbnail"
          accept="image/jpeg,image/png,image/webp"
          uploadUrl={`/api/instructor/media/thumbnail/${course.id}`}
          removeUrl={`/api/instructor/media/thumbnail/${course.id}`}
          current={course.thumbnailAsset}
          onChange={onThumbnailChange}
        />
        <MediaUploadField
          label="Preview video"
          accept="video/mp4,video/webm"
          uploadUrl={`/api/instructor/media/preview/${course.id}`}
          removeUrl={`/api/instructor/media/preview/${course.id}`}
          current={course.previewAsset}
          onChange={onPreviewChange}
        />
      </div>
    </Card>
  );
}

function TagListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-1.5 rounded-full bg-panel-2 px-3 py-1 text-xs ring-1 ring-line"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add ${label.toLowerCase()}…`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) {
                onChange([...items, draft.trim()]);
                setDraft("");
              }
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function PricingCard({
  course,
  saving,
  onSave,
}: {
  course: CourseBuilderDTO;
  saving: boolean;
  onSave: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const [outcomes, setOutcomes] = useState(course.learningOutcomes);
  const [requirements, setRequirements] = useState(course.requirements);
  const [audience, setAudience] = useState(course.targetAudience);

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg tracking-tight">Pricing & outcomes</h2>
      <form
        className="mt-5 space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const price = Number(data.get("price"));
          const discountRaw = data.get("discountPrice");
          const discountPrice = discountRaw ? Number(discountRaw) : undefined;
          await onSave({
            price,
            discountPrice,
            learningOutcomes: outcomes,
            requirements,
            targetAudience: audience,
          });
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Price (USD)" htmlFor="price" hint="Set to 0 for a free course">
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={course.price}
              required
            />
          </FormField>
          <FormField label="Discount price (optional)" htmlFor="discountPrice">
            <Input
              id="discountPrice"
              name="discountPrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={course.discountPrice ?? ""}
            />
          </FormField>
        </div>

        <TagListEditor label="Learning outcomes" items={outcomes} onChange={setOutcomes} />
        <TagListEditor label="Requirements" items={requirements} onChange={setRequirements} />
        <TagListEditor label="Target audience" items={audience} onChange={setAudience} />

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save pricing & outcomes"}
        </Button>
      </form>
    </Card>
  );
}

function CurriculumCard({
  courseId,
  sections,
  onChange,
}: {
  courseId: string;
  sections: CourseBuilderDTO["sections"];
  onChange: () => Promise<void>;
}) {
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function addSection() {
    if (!newSectionTitle.trim() || busy) return;
    setBusy(true);
    try {
      const result = await createSectionFn({
        data: { courseId, fields: { title: newSectionTitle.trim() } },
      });
      if (result.success) {
        setNewSectionTitle("");
        await onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  async function renameSection(sectionId: string, title: string) {
    await updateSectionFn({ data: { courseId, sectionId, fields: { title } } });
    await onChange();
  }

  async function removeSection(sectionId: string) {
    if (!confirm("Delete this section and all its lessons?")) return;
    await deleteSectionFn({ data: { courseId, sectionId } });
    await onChange();
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await reorderSectionsFn({ data: { courseId, orderedIds: ids } });
    await onChange();
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg tracking-tight">Curriculum</h2>

      <div className="mt-5 space-y-4">
        {sections.map((section, sIndex) => (
          <div key={section.id} className="rounded-xl bg-panel-2 p-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                defaultValue={section.title}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== section.title &&
                  renameSection(section.id, e.target.value.trim())
                }
                className="max-w-[320px] flex-1"
              />
              <div className="flex items-center gap-1">
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:text-cream disabled:opacity-30"
                  disabled={sIndex === 0}
                  onClick={() => moveSection(sIndex, -1)}
                  aria-label="Move section up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:text-cream disabled:opacity-30"
                  disabled={sIndex === sections.length - 1}
                  onClick={() => moveSection(sIndex, 1)}
                  aria-label="Move section down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSection(section.id)}
                  aria-label="Delete section"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <LessonList
              courseId={courseId}
              sectionId={section.id}
              lessons={section.lessons}
              onChange={onChange}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <Input
          value={newSectionTitle}
          onChange={(e) => setNewSectionTitle(e.target.value)}
          placeholder="New section title…"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection())}
        />
        <Button type="button" variant="outline" onClick={addSection} disabled={busy}>
          <Plus size={15} /> Add section
        </Button>
      </div>
    </Card>
  );
}

function LessonList({
  courseId,
  sectionId,
  lessons,
  onChange,
}: {
  courseId: string;
  sectionId: string;
  lessons: CourseBuilderDTO["sections"][number]["lessons"];
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  async function addLesson() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const result = await createLessonFn({
        data: { courseId, sectionId, fields: { title: title.trim(), type: "VIDEO" } },
      });
      if (result.success) {
        setTitle("");
        await onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeLesson(lessonId: string) {
    await deleteLessonFn({ data: { courseId, lessonId } });
    await onChange();
  }

  async function togglePreview(lessonId: string, isPreview: boolean) {
    await updateLessonFn({ data: { courseId, lessonId, fields: { isPreview: !isPreview } } });
    await onChange();
  }

  async function moveLesson(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const ids = lessons.map((l) => l.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await reorderLessonsFn({ data: { courseId, sectionId, orderedIds: ids } });
    await onChange();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {lessons.map((lesson, lIndex) => (
        <div key={lesson.id} className="rounded-lg bg-panel px-3 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{lesson.title}</span>
            {lesson.isPreview && <Badge tone="soft">Preview</Badge>}
            {lesson.type === "VIDEO" && !lesson.video && !lesson.videoUrl && (
              <Badge tone="warn">No video</Badge>
            )}
            <div className="flex items-center gap-1">
              <button
                className="rounded-md p-1.5 text-muted-foreground hover:text-cream disabled:opacity-30"
                disabled={lIndex === 0}
                onClick={() => moveLesson(lIndex, -1)}
                aria-label="Move lesson up"
              >
                <ArrowUp size={13} />
              </button>
              <button
                className="rounded-md p-1.5 text-muted-foreground hover:text-cream disabled:opacity-30"
                disabled={lIndex === lessons.length - 1}
                onClick={() => moveLesson(lIndex, 1)}
                aria-label="Move lesson down"
              >
                <ArrowDown size={13} />
              </button>
              <button
                className="rounded-md px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-cream"
                onClick={() => togglePreview(lesson.id, lesson.isPreview)}
              >
                {lesson.isPreview ? "Unmark preview" : "Mark preview"}
              </button>
              <button
                className="rounded-md px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-cream"
                onClick={() =>
                  setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)
                }
              >
                {expandedLessonId === lesson.id ? "Hide media" : "Media"}
              </button>
              <button
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => removeLesson(lesson.id)}
                aria-label="Delete lesson"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {expandedLessonId === lesson.id && (
            <LessonMediaPanel
              courseId={courseId}
              lessonId={lesson.id}
              lessonType={lesson.type}
              video={lesson.video}
              resources={lesson.resources}
              onChange={onChange}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New lesson title…"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLesson())}
          className="text-sm"
        />
        <Button type="button" variant="ghost" size="sm" onClick={addLesson} disabled={busy}>
          <Plus size={14} /> Add lesson
        </Button>
      </div>
    </div>
  );
}

function LessonMediaPanel({
  courseId,
  lessonId,
  lessonType,
  video,
  resources,
  onChange,
}: {
  courseId: string;
  lessonId: string;
  lessonType: "VIDEO" | "ARTICLE" | "QUIZ";
  video: AssetDTO | null;
  resources: CourseBuilderDTO["sections"][number]["lessons"][number]["resources"];
  onChange: () => Promise<void>;
}) {
  const [resourceTitle, setResourceTitle] = useState("");
  const [uploadingResource, setUploadingResource] = useState(false);
  const [resourceError, setResourceError] = useState("");

  async function uploadResource(file: File) {
    setUploadingResource(true);
    setResourceError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", resourceTitle.trim() || file.name);
      const response = await fetch(
        `/api/instructor/media/lesson-resource/${courseId}/${lessonId}`,
        { method: "POST", headers: { [CSRF_HEADER_NAME]: getCsrfToken() }, body: formData },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setResourceError(body?.error ?? "Upload failed.");
        return;
      }
      setResourceTitle("");
      await onChange();
    } finally {
      setUploadingResource(false);
    }
  }

  async function removeResource(resourceId: string) {
    await fetch(`/api/instructor/media/resource/${courseId}/${lessonId}/${resourceId}`, {
      method: "DELETE",
      headers: { [CSRF_HEADER_NAME]: getCsrfToken() },
    });
    await onChange();
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-line bg-panel-2 p-3">
      {lessonType === "VIDEO" && (
        <MediaUploadField
          label="Lesson video"
          accept="video/mp4,video/webm"
          uploadUrl={`/api/instructor/media/lesson-video/${courseId}/${lessonId}`}
          removeUrl={`/api/instructor/media/lesson-video/${courseId}/${lessonId}`}
          current={video}
          onChange={() => void onChange()}
        />
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Lesson resources
        </p>
        <div className="space-y-2">
          {resources.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md bg-panel px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <button
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => removeResource(r.id)}
                aria-label={`Remove ${r.title}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {resources.length === 0 && (
            <p className="text-xs text-muted-foreground">No resources attached yet.</p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={resourceTitle}
            onChange={(e) => setResourceTitle(e.target.value)}
            placeholder="Resource title (optional)"
            className="max-w-[220px] text-sm"
            disabled={uploadingResource}
          />
          <label>
            <span className="sr-only">Upload resource</span>
            <input
              type="file"
              accept=".pdf,.zip,.doc,.docx,.ppt,.pptx,.txt"
              className="hidden"
              disabled={uploadingResource}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadResource(file);
                e.target.value = "";
              }}
              id={`resource-upload-${lessonId}`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingResource}
              onClick={() => document.getElementById(`resource-upload-${lessonId}`)?.click()}
            >
              {uploadingResource ? "Uploading…" : "Add resource"}
            </Button>
          </label>
        </div>
        {resourceError && <p className="mt-1.5 text-xs text-destructive">{resourceError}</p>}
      </div>
    </div>
  );
}
