import { useState } from "react";
import { Play } from "lucide-react";
import { categoryImage } from "@/lib/course-images";
import { cn } from "@/lib/utils";

export function VideoPlayerPlaceholder({
  categorySlug = "web-development",
  label = "Preview this course",
  caption,
  className,
  videoUrl,
  posterUrl,
}: {
  categorySlug?: string;
  label?: string;
  caption?: string;
  className?: string;
  /** When set, clicking play starts real playback instead of just showing the placeholder image. */
  videoUrl?: string | null;
  posterUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const poster = posterUrl ?? categoryImage(categorySlug);

  if (playing && videoUrl) {
    return (
      <div className={cn("overflow-hidden rounded-2xl bg-ink ring-1 ring-line", className)}>
        <video src={videoUrl} poster={poster} controls autoPlay className="aspect-video w-full" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl ring-1 ring-line", className)}>
      <img
        src={poster}
        alt=""
        loading="lazy"
        width={1024}
        height={576}
        className="aspect-video w-full object-cover opacity-45"
      />
      <div className="absolute inset-0 grid place-items-center bg-ink/40">
        <button
          type="button"
          onClick={() => videoUrl && setPlaying(true)}
          disabled={!videoUrl}
          className="grid size-16 place-items-center rounded-full bg-cream text-ink transition-transform duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70"
          aria-label={label}
        >
          <Play size={22} className="ml-0.5 fill-current" />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-ink/90 to-transparent p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream">{label}</span>
        {caption && <span className="font-mono text-[10px] text-muted-foreground">{caption}</span>}
      </div>
    </div>
  );
}
