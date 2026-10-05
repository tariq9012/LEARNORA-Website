import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  Globe,
  Heart,
  RefreshCcw,
  Award,
  Clock3,
  Users,
  CalendarDays,
  BarChart2,
  Star,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Rating,
  ProgressBar,
  Modal,
  Textarea,
} from "@/components/ui/kit";
import { VideoPlayerPlaceholder } from "@/components/course/VideoPlayerPlaceholder";
import { CourseCurriculum } from "@/components/course/CourseCurriculum";
import { ReviewCard } from "@/components/course/ReviewCard";
import { getCourseBySlugFn } from "@/server/functions/catalog";
import {
  enrollInCourseFn,
  getEnrollmentStateFn,
  getWishlistStateFn,
  addWishlistFn,
  removeWishlistFn,
} from "@/server/functions/learning";
import {
  createCourseReviewFn,
  deleteCourseReviewFn,
  getMyCourseReviewFn,
  updateCourseReviewFn,
} from "@/server/functions/review";
import type { MyReviewStateDTO } from "@/server/dto/review";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/courses/$courseId")({
  loader: async ({ params }) => {
    const course = await getCourseBySlugFn({ data: { slug: params.courseId } });
    if (!course) throw notFound();
    const [enrollmentState, wishlisted, myReview] = await Promise.all([
      getEnrollmentStateFn({ data: { courseSlug: params.courseId } }),
      getWishlistStateFn({ data: { courseSlug: params.courseId } }),
      getMyCourseReviewFn({ data: { courseSlug: params.courseId } }),
    ]);
    return { course, enrollmentState, wishlisted, myReview };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Course unavailable — Learnora" }, { name: "robots", content: "noindex" }],
      };
    }
    const { course } = loaderData;
    return {
      meta: [
        { title: `${course.title} — Learnora` },
        { name: "description", content: course.subtitle },
        { property: "og:title", content: `${course.title} — Learnora` },
        { property: "og:description", content: course.subtitle },
      ],
    };
  },
  notFoundComponent: CourseNotFound,
  component: CourseDetail,
});

function CourseNotFound() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-[1240px] px-6 py-24 text-center">
        <h1 className="font-display text-4xl tracking-tight">Course not found</h1>
        <p className="mt-3 text-muted-foreground">
          This course may have been unpublished or renamed.
        </p>
        <Link to="/courses" className="mt-6 inline-block">
          <Button>Browse the catalogue</Button>
        </Link>
      </div>
    </SiteLayout>
  );
}

function CourseDetail() {
  const {
    course,
    enrollmentState,
    wishlisted: initialWishlisted,
    myReview: initialMyReview,
  } = Route.useLoaderData();
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const instructor = course.instructorProfile;

  const [enrollState, setEnrollState] = useState(enrollmentState);
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [showEnrolledModal, setShowEnrolledModal] = useState(false);
  const [myReview, setMyReview] = useState<MyReviewStateDTO>(initialMyReview);

  const discount = course.originalPrice
    ? Math.round((1 - course.price / course.originalPrice) * 100)
    : null;

  async function handleEnrollClick() {
    if (!user) {
      await navigate({ to: "/login", search: { redirect: `/courses/${course.id}` } });
      return;
    }
    if (user.role !== "STUDENT") {
      setEnrollError("Only student accounts can enrol in courses.");
      return;
    }
    if (enrollState.status === "enrolled") {
      if (enrollState.completed) {
        document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      await navigate({ to: "/student/course/$courseId", params: { courseId: course.id } });
      return;
    }
    if (course.price > 0) {
      await navigate({ to: "/checkout/$courseId", params: { courseId: course.id } });
      return;
    }

    setEnrollError("");
    setEnrolling(true);
    try {
      const result = await enrollInCourseFn({ data: { courseSlug: course.id } });
      if (!result.success) {
        setEnrollError(result.error);
        return;
      }
      setEnrollState({ status: "enrolled", progress: 0, completed: false });
      await router.invalidate();
      const refreshedReview = await getMyCourseReviewFn({
        data: { courseSlug: course.id },
      });
      setMyReview(refreshedReview);
      setShowEnrolledModal(true);
    } finally {
      setEnrolling(false);
    }
  }

  async function handleWishlistClick() {
    if (!user) {
      await navigate({ to: "/login", search: { redirect: `/courses/${course.id}` } });
      return;
    }
    if (wishlistBusy) return;
    setWishlistBusy(true);
    try {
      const next = !wishlisted;
      const result = next
        ? await addWishlistFn({ data: { courseSlug: course.id } })
        : await removeWishlistFn({ data: { courseSlug: course.id } });
      if (result.success) setWishlisted(next);
    } finally {
      setWishlistBusy(false);
    }
  }

  const enrollLabel =
    enrollState.status === "enrolled"
      ? enrollState.completed
        ? "Review course"
        : `Go to course (${enrollState.progress}%)`
      : enrolling
        ? "Enrolling…"
        : "Enrol now";

  return (
    <SiteLayout>
      <header className="glow border-b border-line">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-12 lg:grid-cols-[1fr_360px] lg:py-16">
          <div>
            <p className="eyebrow">{course.category}</p>
            <h1 className="mt-4 font-display text-4xl tracking-tight lg:text-5xl text-balance">
              {course.title}
            </h1>
            <p className="mt-4 max-w-[60ch] text-lg text-muted-foreground text-pretty">
              {course.subtitle}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <Rating value={course.rating} count={course.reviewCount} />
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users size={14} /> {course.students.toLocaleString()} students
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays size={14} /> Updated {course.updated}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <BarChart2 size={14} /> {course.level}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Globe size={14} /> {course.language}
              </span>
            </div>

            {instructor && (
              <Link
                to="/instructors/$instructorId"
                params={{ instructorId: instructor.id }}
                className="mt-6 inline-flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel"
              >
                <Avatar initials={instructor.initials} src={instructor.avatarUrl} />
                <span>
                  <span className="block text-sm font-medium">{instructor.name}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {instructor.title}
                  </span>
                </span>
              </Link>
            )}

            <VideoPlayerPlaceholder
              className="mt-8"
              categorySlug={course.categorySlug}
              label="Preview this course"
              caption={`${course.duration} of video`}
              videoUrl={course.previewVideoUrl}
              posterUrl={course.thumbnailUrl}
            />
          </div>

          {/* Purchase card */}
          <aside>
            <Card className="lg:sticky lg:top-24 p-5">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl">{formatPrice(course.price)}</span>
                {course.originalPrice && (
                  <span className="text-muted-foreground line-through">
                    {formatPrice(course.originalPrice)}
                  </span>
                )}
                {discount && <Badge tone="brand">-{discount}%</Badge>}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                Price includes lifetime access and updates
              </p>

              <Button
                block
                size="lg"
                className="mt-5"
                onClick={handleEnrollClick}
                disabled={enrolling}
              >
                {enrollLabel}
              </Button>
              {enrollError && <p className="mt-2 text-sm text-destructive">{enrollError}</p>}
              <Button
                block
                variant="outline"
                className="mt-2"
                onClick={handleWishlistClick}
                disabled={wishlistBusy}
                aria-pressed={wishlisted}
              >
                <Heart size={16} className={wishlisted ? "fill-brand text-brand" : ""} />
                {wishlisted ? "Saved to wishlist" : "Add to wishlist"}
              </Button>

              <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm text-muted-foreground">
                <li className="flex items-center gap-3">
                  <Clock3 size={15} className="text-brand-soft" /> {course.duration} of on-demand
                  video
                </li>
                <li className="flex items-center gap-3">
                  <Award size={15} className="text-brand-soft" /> Certificate of completion
                </li>
                <li className="flex items-center gap-3">
                  <RefreshCcw size={15} className="text-brand-soft" /> 30-day refund guarantee
                </li>
                <li className="flex items-center gap-3">
                  <Globe size={15} className="text-brand-soft" /> Access on desktop and mobile
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-14 lg:grid-cols-[1fr_360px]">
        <div className="space-y-14">
          <section>
            <h2 className="font-display text-2xl tracking-tight">What you will learn</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {course.outcomes.map((o) => (
                <li key={o} className="flex gap-3 text-sm text-muted-foreground">
                  <Check size={16} className="mt-0.5 shrink-0 text-good" />
                  {o}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight">Course description</h2>
            <p className="mt-4 leading-relaxed text-pretty text-muted-foreground">
              {course.description}
            </p>
          </section>

          <section>
            <h2 className="mb-5 font-display text-2xl tracking-tight">Curriculum</h2>
            <CourseCurriculum sections={course.curriculum} />
          </section>

          <section>
            <h2 className="font-display text-2xl tracking-tight">Requirements</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {course.requirements.map((r) => (
                <li key={r} className="flex gap-3">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-brand-soft" />
                  {r}
                </li>
              ))}
            </ul>
          </section>

          {instructor && (
            <section>
              <h2 className="font-display text-2xl tracking-tight">Your instructor</h2>
              <Card className="mt-5 p-6">
                <div className="flex flex-wrap items-start gap-5">
                  <Avatar initials={instructor.initials} src={instructor.avatarUrl} size="xl" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-xl tracking-tight">{instructor.name}</h3>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {instructor.title}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                      <span>★ {instructor.rating} rating</span>
                      <span>{instructor.students.toLocaleString()} students</span>
                      <span>{instructor.courses} courses</span>
                      <span>{instructor.reviews.toLocaleString()} reviews</span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {instructor.bio}
                    </p>
                    <Link
                      to="/instructors/$instructorId"
                      params={{ instructorId: instructor.id }}
                      className="mt-5 inline-block"
                    >
                      <Button variant="outline" size="sm">
                        View profile
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            </section>
          )}

          <section id="reviews">
            <h2 className="font-display text-2xl tracking-tight">Student reviews</h2>
            <Card className="mt-5 grid gap-8 p-6 sm:grid-cols-[180px_1fr]">
              <div className="text-center sm:text-left">
                <p className="font-display text-5xl">{course.rating}</p>
                <Rating value={course.rating} showValue={false} className="mt-2" />
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {course.reviewCount.toLocaleString()} reviews
                </p>
              </div>
              <div className="space-y-2">
                {course.ratingBreakdown.map((b) => (
                  <div key={b.stars} className="flex items-center gap-3">
                    <span className="w-12 font-mono text-[11px] text-muted-foreground">
                      {b.stars} star
                    </span>
                    <ProgressBar value={b.pct} className="flex-1" />
                    <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                      {b.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <MyReviewSection
              courseSlug={course.id}
              state={myReview}
              onChanged={async (next) => {
                setMyReview(next);
                await router.invalidate();
              }}
            />

            {course.reviews.length > 0 ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {course.reviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    reviewId={r.id}
                    canReport={
                      !(myReview.state === "already_reviewed" && myReview.review.id === r.id)
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                No reviews yet — be the first to enrol and share one.
              </p>
            )}
          </section>
        </div>
        <div className="hidden lg:block" />
      </div>

      <Modal
        open={showEnrolledModal}
        onClose={() => setShowEnrolledModal(false)}
        title="You're enrolled"
        description="Lifetime access to this course is now in your account."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowEnrolledModal(false)}>
              Stay on this page
            </Button>
            <Link to="/student/course/$courseId" params={{ courseId: course.id }}>
              <Button>Open course player</Button>
            </Link>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          You're enrolled in <span className="text-cream">{course.title}</span>. Head to My Learning
          any time to pick up where you left off.
        </p>
      </Modal>
    </SiteLayout>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          className="p-0.5 text-gold transition-transform hover:scale-110"
        >
          <Star size={22} className={n <= value ? "fill-gold" : "opacity-25"} />
        </button>
      ))}
    </div>
  );
}

/**
 * Handles all four states a visitor can be in re: reviewing this course:
 * not eligible (shows why), eligible with no review yet (shows the
 * form), already reviewed (shows it read-only with Edit/Delete), or
 * mid-edit (shows the form pre-filled). Eligibility itself is always
 * server-derived (see getMyCourseReview) — this component never decides
 * who's allowed to review, only how to present what the server said.
 */
function MyReviewSection({
  courseSlug,
  state,
  onChanged,
}: {
  courseSlug: string;
  state: MyReviewStateDTO;
  onChanged: (next: MyReviewStateDTO) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(
    state.state === "already_reviewed" ? state.review.rating : 5,
  );
  const [comment, setComment] = useState(
    state.state === "already_reviewed" ? state.review.body : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (state.state === "not_eligible") {
    return <Card className="mt-5 p-5 text-sm text-muted-foreground">{state.reason}</Card>;
  }

  if (state.state === "already_reviewed" && !editing) {
    return (
      <Card className="mt-5 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Your review
        </p>
        <div className="mt-2">
          <ReviewCard review={state.review} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRating(state.review.rating);
              setComment(state.review.body);
              setError("");
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await deleteCourseReviewFn({
                  data: { reviewId: state.review.id },
                });
                if (result.success) await onChanged({ state: "can_review" });
                else setError(result.error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </Card>
    );
  }

  const isEditingExisting = state.state === "already_reviewed";

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = isEditingExisting
        ? await updateCourseReviewFn({
            data: { reviewId: state.review.id, rating, comment },
          })
        : await createCourseReviewFn({ data: { courseSlug, rating, comment } });
      if (result.success) {
        setEditing(false);
        await onChanged({ state: "already_reviewed", review: result.data });
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {isEditingExisting ? "Edit your review" : "Leave a review"}
      </p>
      <div className="mt-3">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <Textarea
        className="mt-3"
        rows={4}
        placeholder="What did you think of this course? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={busy}
      />
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Submit review"}
        </Button>
        {isEditingExisting && (
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}
