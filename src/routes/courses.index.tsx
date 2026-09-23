import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { SlidersHorizontal, X } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { Button, Card, EmptyState, SearchBar, Select } from "@/components/ui/kit";
import { CourseCard } from "@/components/course/CourseCard";
import { getCoursesFn, getCategoriesFn } from "@/server/functions/catalog";
import type { CourseSort, PriceBucket } from "@/server/repositories/course-repository";

const courseSearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  level: z.string().optional(),
  price: z.enum(["under_40", "40_60", "over_60"]).optional(),
  sort: z.enum(["popular", "newest", "rating", "price_asc", "price_desc"]).optional(),
});

export const Route = createFileRoute("/courses/")({
  validateSearch: courseSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [coursesPage, categories] = await Promise.all([
      getCoursesFn({
        data: {
          ...(deps.q !== undefined && { search: deps.q }),
          ...(deps.category !== undefined && { categorySlug: deps.category }),
          ...(deps.level !== undefined && { level: deps.level }),
          ...(deps.price !== undefined && { priceBucket: deps.price }),
          sort: deps.sort ?? "popular",
          page: 1,
        },
      }),
      getCategoriesFn(),
    ]);
    return { coursesPage, categories };
  },
  head: () => ({
    meta: [
      { title: "Browse courses — Learnora" },
      {
        name: "description",
        content: "Filter practitioner-led courses by discipline, level and price.",
      },
      { property: "og:title", content: "Browse courses — Learnora" },
      {
        property: "og:description",
        content: "Find your next course across software, data, design and business.",
      },
    ],
  }),
  component: BrowseCourses,
});

const ALL_LEVELS = "All levels";
const levels = [ALL_LEVELS, "Beginner", "Intermediate", "Advanced"];

const PRICE_OPTIONS: { label: string; value: PriceBucket | "any" }[] = [
  { label: "Any price", value: "any" },
  { label: "Under $40", value: "under_40" },
  { label: "$40 – $60", value: "40_60" },
  { label: "Over $60", value: "over_60" },
];

const SORT_OPTIONS: { label: string; value: CourseSort }[] = [
  { label: "Most popular", value: "popular" },
  { label: "Highest rated", value: "rating" },
  { label: "Newest", value: "newest" },
  { label: "Price: low to high", value: "price_asc" },
  { label: "Price: high to low", value: "price_desc" },
];

function BrowseCourses() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { coursesPage, categories } = Route.useLoaderData();

  const [queryInput, setQueryInput] = useState(search.q ?? "");
  const [items, setItems] = useState(coursesPage.items);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Whenever the loader re-runs with new results (a filter/sort/search
  // navigation completed), reset the accumulated "load more" state back
  // to just that fresh first page.
  useEffect(() => {
    setItems(coursesPage.items);
    setLoadedPages(1);
  }, [coursesPage]);

  function updateSearch(patch: Partial<typeof search>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }) });
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = loadedPages + 1;
      const result = await getCoursesFn({
        data: {
          ...(search.q !== undefined && { search: search.q }),
          ...(search.category !== undefined && { categorySlug: search.category }),
          ...(search.level !== undefined && { level: search.level }),
          ...(search.price !== undefined && { priceBucket: search.price }),
          sort: search.sort ?? "popular",
          page: nextPage,
        },
      });
      setItems((prev) => [...prev, ...result.items]);
      setLoadedPages(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }

  const reset = () => {
    setQueryInput("");
    navigate({ to: "/courses", search: {} });
  };

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <label className="block">
        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Category
        </span>
        <Select
          value={search.category ?? "all"}
          onChange={(e) =>
            updateSearch({ category: e.target.value === "all" ? undefined : e.target.value })
          }
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Level
        </span>
        <Select
          value={search.level ?? ALL_LEVELS}
          onChange={(e) =>
            updateSearch({ level: e.target.value === ALL_LEVELS ? undefined : e.target.value })
          }
        >
          {levels.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Price
        </span>
        <Select
          value={search.price ?? "any"}
          onChange={(e) =>
            updateSearch({
              price: e.target.value === "any" ? undefined : (e.target.value as PriceBucket),
            })
          }
        >
          {PRICE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <Button variant="ghost" onClick={reset} className="justify-start">
        <X size={14} /> Clear filters
      </Button>
    </div>
  );

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Catalogue"
        title="Browse courses"
        description="Practitioner-led courses across every discipline, backed by our live catalogue."
      >
        <SearchBar
          className="max-w-[560px]"
          value={queryInput}
          onChange={(v) => setQueryInput(v)}
          onSubmit={(v) => updateSearch({ q: v || undefined })}
          placeholder="Search courses, topics or instructors"
        />
      </PageHeader>

      <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-12 lg:grid-cols-[260px_1fr]">
        <aside>
          <Button
            variant="outline"
            block
            className="lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} /> {filtersOpen ? "Hide filters" : "Show filters"}
          </Button>
          <Card
            className={`mt-3 p-5 lg:mt-0 lg:sticky lg:top-24 ${filtersOpen ? "" : "hidden lg:block"}`}
          >
            <h2 className="mb-4 font-display text-lg tracking-tight">Filters</h2>
            {filterFields}
          </Card>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-cream">{coursesPage.totalItems}</span> courses found
            </p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Sort by
              <Select
                value={search.sort ?? "popular"}
                onChange={(e) => updateSearch({ sort: e.target.value as CourseSort })}
                className="w-auto py-2"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {coursesPage.totalItems === 0 ? (
            <EmptyState
              title="No courses match those filters"
              description="Try widening the price or level range, or clear the filters to see the full catalogue."
              action={<Button onClick={reset}>Clear filters</Button>}
            />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
              {items.length < coursesPage.totalItems && (
                <div className="mt-10 flex justify-center">
                  <Button variant="outline" size="lg" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more courses"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
