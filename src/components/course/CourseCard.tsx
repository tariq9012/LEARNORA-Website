import { Link } from "@tanstack/react-router";
import { Badge, Rating } from "@/components/ui/kit";
import { categoryImage } from "@/lib/course-images";
import { currency } from "@/data/mock";
import type { CourseCardDTO } from "@/server/dto/course";
import { cn } from "@/lib/utils";

export function CourseCard({ course, className }: { course: CourseCardDTO; className?: string }) {
  const discount = course.originalPrice
    ? Math.round((1 - course.price / course.originalPrice) * 100)
    : null;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl bg-panel ring-1 ring-line transition-all duration-200 hover:-translate-y-1 hover:ring-brand/40",
        className,
      )}
    >
      <Link to="/courses/$courseId" params={{ courseId: course.id }} className="relative block">
        <img
          src={course.thumbnailUrl ?? categoryImage(course.categorySlug)}
          alt={`${course.title} course cover`}
          loading="lazy"
          width={1024}
          height={576}
          className="aspect-video w-full object-cover"
        />
        {discount && (
          <Badge tone="brand" className="absolute left-3 top-3">
            -{discount}%
          </Badge>
        )}
        <Badge tone="neutral" className="absolute right-3 top-3">
          {course.level}
        </Badge>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          <span className="text-brand-soft">{course.category}</span>
          <span>{course.duration}</span>
        </div>

        <h3 className="mt-2 font-display text-lg leading-snug tracking-tight">
          <Link
            to="/courses/$courseId"
            params={{ courseId: course.id }}
            className="transition-colors hover:text-brand-soft"
          >
            {course.title}
          </Link>
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">{course.instructor}</p>

        <div className="mt-4">
          <Rating value={course.rating} count={course.reviewCount} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl">{currency(course.price)}</span>
            {course.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {currency(course.originalPrice)}
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {course.students.toLocaleString()} students
          </span>
        </div>
      </div>
    </article>
  );
}
