import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { AvatarUploadField } from "@/components/account/AvatarUploadField";
import { Badge, Button, Card, FormField, Input, Textarea } from "@/components/ui/kit";
import { initialsOf } from "@/lib/format";
import {
  getMyAccountFn,
  updateInstructorProfileFn,
  updateMyAccountNameFn,
} from "@/server/functions/account";
import { getInstructorProfileFn } from "@/server/functions/catalog";
import type { AccountOverviewDTO } from "@/server/dto/account";
import type { InstructorSummaryDTO } from "@/server/dto/instructor";

export const Route = createFileRoute("/instructor/profile")({
  loader: async () => {
    const account = await getMyAccountFn();
    // Only APPROVED instructors have a public profile to fetch stats
    // from — a pending/rejected instructor simply has none yet.
    const publicProfile = await getInstructorProfileFn({
      data: { instructorId: account.id },
    }).catch(() => null);
    return { account, publicProfile };
  },
  head: () => ({
    meta: [
      { title: "Instructor profile — Learnora" },
      {
        name: "description",
        content: "Edit the public instructor profile students see on your Learnora courses.",
      },
      { property: "og:title", content: "Instructor profile — Learnora" },
      { property: "og:description", content: "Your public Learnora teaching profile." },
    ],
  }),
  component: InstructorProfile,
});

const APPROVAL_LABEL: Record<string, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function InstructorProfile() {
  const { account: initialAccount, publicProfile } = Route.useLoaderData();
  const [account, setAccount] = useState<AccountOverviewDTO>(initialAccount);
  const stats: InstructorSummaryDTO | null = publicProfile?.instructor ?? null;

  const [name, setName] = useState(account.name);
  const profile = account.instructorProfile;
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [expertise, setExpertise] = useState(profile?.expertise.join(", ") ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [linkedin, setLinkedin] = useState(profile?.socialLinks["LinkedIn"] ?? "");

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

    const socialLinks: Record<string, string> = {};
    if (linkedin.trim()) socialLinks["LinkedIn"] = linkedin.trim();

    const result = await updateInstructorProfileFn({
      data: {
        headline,
        bio,
        website,
        socialLinks,
        expertise: expertise
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setAccount((prev) => ({ ...prev, name, instructorProfile: result.data }));
    setSaved(true);
  }

  if (!profile) {
    return (
      <DashboardLayout role="instructor">
        <DashboardHeader
          title="Instructor profile"
          description="This appears on every course you publish."
        />
        <Card className="p-6 text-sm text-muted-foreground">
          Your instructor profile isn't set up yet. Contact support if this looks wrong.
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="instructor">
      <DashboardHeader
        title="Instructor profile"
        description="This appears on every course you publish."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-6 text-center">
          <AvatarUploadField
            avatarUrl={account.avatarUrl}
            initials={initialsOf(account.name)}
            onChange={(avatarUrl) => setAccount((prev) => ({ ...prev, avatarUrl }))}
          />
          <h2 className="mt-4 font-display text-xl tracking-tight">{account.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{headline || "No headline yet"}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge
              tone={
                profile.approvalStatus === "APPROVED"
                  ? "brand"
                  : profile.approvalStatus === "REJECTED"
                    ? "danger"
                    : "warn"
              }
            >
              {APPROVAL_LABEL[profile.approvalStatus]}
            </Badge>
            {stats && (
              <>
                <Badge>{stats.courses} courses</Badge>
                <Badge>{stats.students.toLocaleString("en-US")} students</Badge>
                <Badge>{stats.rating.toFixed(1)} rating</Badge>
              </>
            )}
          </div>
          {profile.approvalStatus === "REJECTED" && profile.rejectionReason && (
            <p className="mt-4 text-left text-xs text-destructive">{profile.rejectionReason}</p>
          )}
        </Card>

        <Card className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <FormField label="Display name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </FormField>
            <FormField label="Professional headline">
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={200}
              />
            </FormField>
            <FormField label="Biography" hint="Students read this before enrolling.">
              <Textarea
                rows={6}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={4000}
              />
            </FormField>
            <FormField label="Areas of expertise" hint="Comma separated.">
              <Input value={expertise} onChange={(e) => setExpertise(e.target.value)} />
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Website">
                <Input
                  type="url"
                  placeholder="https://"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={300}
                />
              </FormField>
              <FormField label="LinkedIn">
                <Input
                  type="url"
                  placeholder="https://linkedin.com/in/…"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  maxLength={300}
                />
              </FormField>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save profile
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
