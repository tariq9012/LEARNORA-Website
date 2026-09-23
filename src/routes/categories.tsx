import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/layout/SiteLayout";
import { CategoryCard } from "@/components/course/CategoryCard";
import { CourseCard } from "@/components/course/CourseCard";
import { SectionHeading } from "@/components/ui/kit";
import { getCategoriesFn, getCoursesFn } from "@/server/functions/catalog";

export const Route = createFileRoute("/categories")({
  loader: async () => {
    const [categories, popularPage] = await Promise.all([
      getCategoriesFn(),
      getCoursesFn({ data: { sort: "popular", page: 1, pageSize: 3 } }),
    ]);
    return { categories, popular: popularPage.items };
  },
  head: () => ({
    meta: [
      { title: "Course categories — Learnora" },
      {
        name: "description",
        content: "Every discipline on Learnora, each led by working practitioners.",
      },
      { property: "og:title", content: "Course categories — Learnora" },
      { property: "og:description", content: "Explore Learnora's learning disciplines." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { categories, popular } = Route.useLoaderData();

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Disciplines"
        title="Categories"
        description="Each discipline is curated by a senior mentor who reviews every course before it is published."
      />
      <section className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>
      {popular.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-6 pb-20">
          <SectionHeading eyebrow="Across disciplines" title="Most enrolled this month" />
          <div className="grid gap-5 md:grid-cols-3">
            {popular.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}
    </SiteLayout>
  );
}
