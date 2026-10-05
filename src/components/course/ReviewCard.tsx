import { Avatar, Card, Rating } from "@/components/ui/kit";
import { ReportButton } from "@/components/moderation/ReportButton";

type ReviewCardData = {
  initials: string;
  author: string;
  role: string;
  date: string;
  rating: number;
  body: string;
  course?: string;
};

export function ReviewCard({
  review,
  showCourse = false,
  reviewId,
  canReport = false,
}: {
  review: ReviewCardData;
  showCourse?: boolean;
  /** The review's id — required together with canReport to show the Report action. */
  reviewId?: string;
  /** Never true for the viewer's own review (the caller decides that; the server also refuses it either way). */
  canReport?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={review.initials} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{review.author}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{review.role}</p>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{review.date}</span>
      </div>
      {canReport && reviewId && (
        <div className="mt-2 flex justify-end">
          <ReportButton target={{ type: "review", reviewId }} />
        </div>
      )}
      <div className="mt-3">
        <Rating value={review.rating} showValue={false} />
      </div>
      {showCourse && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-brand-soft">
          {review.course}
        </p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{review.body}</p>
    </Card>
  );
}
