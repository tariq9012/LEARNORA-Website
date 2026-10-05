import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { AvatarUploadField } from "@/components/account/AvatarUploadField";
import { Button, Card, FormField, Input, Textarea } from "@/components/ui/kit";
import { initialsOf } from "@/lib/format";
import {
  getMyAccountFn,
  updateMyAccountNameFn,
  updateStudentProfileFn,
} from "@/server/functions/account";
import type { AccountOverviewDTO } from "@/server/dto/account";

export const Route = createFileRoute("/student/profile")({
  loader: async () => ({ account: await getMyAccountFn() }),
  head: () => ({
    meta: [
      { title: "Profile — Learnora" },
      {
        name: "description",
        content: "Manage your Learnora public profile, headline and interests.",
      },
      { property: "og:title", content: "Profile — Learnora" },
      { property: "og:description", content: "Your Learnora learner profile." },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const { account: initialAccount } = Route.useLoaderData();
  const [account, setAccount] = useState<AccountOverviewDTO>(initialAccount);

  const [name, setName] = useState(account.name);
  const profile = account.studentProfile;
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [interests, setInterests] = useState(profile?.interests.join(", ") ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);

    if (name !== account.name) {
      const nameResult = await updateMyAccountNameFn({ data: { name } });
      if (!nameResult.success) {
        setBusy(false);
        setError(nameResult.error);
        return;
      }
    }

    const profileResult = await updateStudentProfileFn({
      data: {
        headline,
        bio,
        website,
        location,
        interests: interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
    setBusy(false);
    if (!profileResult.success) {
      setError(profileResult.error);
      return;
    }
    setAccount((prev) => ({ ...prev, name, studentProfile: profileResult.data }));
    setSaved(true);
  }

  return (
    <DashboardLayout role="student">
      <DashboardHeader
        title="Profile"
        description="This is what instructors see when you post a question."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6 text-center">
          <AvatarUploadField
            avatarUrl={account.avatarUrl}
            initials={initialsOf(account.name)}
            onChange={(avatarUrl) => setAccount((prev) => ({ ...prev, avatarUrl }))}
          />
          <h2 className="mt-4 font-display text-xl tracking-tight">{account.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{account.email}</p>
        </Card>

        <Card className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <FormField label="Full name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </FormField>
            <FormField label="Headline" hint="Shown next to your questions and reviews.">
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={200}
              />
            </FormField>
            <FormField label="About you">
              <Textarea
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={2000}
              />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Location">
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={120}
                />
              </FormField>
              <FormField label="Website">
                <Input
                  type="url"
                  placeholder="https://"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={300}
                />
              </FormField>
            </div>
            <FormField
              label="Interests"
              hint="Comma-separated, e.g. React, Design systems, Statistics"
            >
              <Input value={interests} onChange={(e) => setInterests(e.target.value)} />
            </FormField>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save changes
              </Button>
              {saved && !error && (
                <span className="font-mono text-[11px] text-good">Profile saved</span>
              )}
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
