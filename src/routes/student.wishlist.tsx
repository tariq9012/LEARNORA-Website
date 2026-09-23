import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Button, EmptyState } from "@/components/ui/kit";
import { CourseCard } from "@/components/course/CourseCard";
import { getMyWishlistFn, removeWishlistFn } from "@/server/functions/learning";

export const Route = createFileRoute("/student/wishlist")({
  loader: async () => ({ items: await getMyWishlistFn() }),
  head: () => ({
    meta: [
      { title: "Wishlist — Learnora" },
      { name: "description", content: "Courses you have saved for later on Learnora." },
      { property: "og:title", content: "Wishlist — Learnora" },
      { property: "og:description", content: "Your saved Learnora courses." },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const { items: initialItems } = Route.useLoaderData();
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function remove(courseSlug: string) {
    setRemovingId(courseSlug);
    try {
      const result = await removeWishlistFn({ data: { courseSlug } });
      if (result.success) {
        setItems((prev) => prev.filter((x) => x.id !== courseSlug));
      }
    } finally {
      setRemovingId(null);
    }
  }

  async function clearAll() {
    const toRemove = [...items];
    setItems([]);
    for (const item of toRemove) {
      await removeWishlistFn({ data: { courseSlug: item.id } });
    }
  }

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="Wishlist"
        description="Saved courses. We will tell you when any of them drop in price."
        action={
          items.length > 0 ? (
            <Button variant="ghost" onClick={clearAll}>
              Clear wishlist
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save courses while browsing and they will collect here for later."
          action={
            <Link to="/courses">
              <Button>Browse courses</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="relative">
              <CourseCard course={c} />
              <button
                onClick={() => remove(c.id)}
                disabled={removingId === c.id}
                aria-label={`Remove ${c.title} from wishlist`}
                className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-ink/80 text-brand ring-1 ring-line transition-colors hover:text-cream disabled:opacity-50"
              >
                <Heart size={14} className="fill-brand" />
              </button>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
