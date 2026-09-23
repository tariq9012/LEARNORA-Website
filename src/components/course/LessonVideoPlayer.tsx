import { useEffect, useRef } from "react";

import { categoryImage } from "@/lib/course-images";
import { cn } from "@/lib/utils";
import { updateVideoProgressFn } from "@/server/functions/learning";

const CHECKPOINT_INTERVAL_SECONDS = 20;

export function LessonVideoPlayer({
  videoUrl,
  categorySlug,
  courseSlug,
  lessonId,
  initialWatchedSeconds,
  initialCompleted,
  className,
  onProgress,
}: {
  videoUrl: string;
  categorySlug: string;
  courseSlug: string;
  lessonId: string;
  initialWatchedSeconds: number;
  initialCompleted: boolean;
  className?: string;
  onProgress: (data: {
    watchedSeconds: number;
    completed: boolean;
    overallPercent: number | null;
    courseCompleted: boolean | null;
  }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReportedAt = useRef(0);
  const resumedRef = useRef(false);

  // Reset the "have we applied the resume position yet" flag whenever the
  // lesson itself changes (this component is remounted via `key` in the
  // parent, but this guards against any future re-render without remount).
  useEffect(() => {
    resumedRef.current = false;
    lastReportedAt.current = 0;
  }, [lessonId]);

  function report(watchedSeconds: number, ended: boolean) {
    void updateVideoProgressFn({
      data: { courseSlug, lessonId, watchedSeconds, ended },
    }).then((result) => {
      if (result.success) onProgress(result.data);
    });
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-ink ring-1 ring-line", className)}>
      <video
        ref={videoRef}
        key={lessonId}
        src={videoUrl}
        poster={categoryImage(categorySlug)}
        controls
        className="aspect-video w-full"
        onLoadedMetadata={(e) => {
          if (resumedRef.current) return;
          resumedRef.current = true;
          const video = e.currentTarget;
          // Don't resume right at the end of an already-completed lesson —
          // start over instead of appearing to do nothing.
          const nearEnd = initialCompleted && initialWatchedSeconds >= video.duration - 1;
          if (!nearEnd && initialWatchedSeconds > 0) {
            video.currentTime = Math.min(initialWatchedSeconds, Math.max(0, video.duration - 1));
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (t - lastReportedAt.current >= CHECKPOINT_INTERVAL_SECONDS) {
            lastReportedAt.current = t;
            report(t, false);
          }
        }}
        onPause={(e) => report(e.currentTarget.currentTime, false)}
        onEnded={(e) => report(e.currentTarget.currentTime, true)}
      />
    </div>
  );
}
