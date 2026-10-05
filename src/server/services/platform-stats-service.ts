import * as repo from "../repositories/platform-stats-repository";
import { publicAssetUrl } from "../media/media-urls";

export type PlatformStatsDTO = {
  activeStudents: number;
  publishedCourses: number;
  instructors: number;
  lessonsCompleted: number;
};

export type FacultyMemberDTO = {
  id: string;
  name: string;
  headline: string | null;
  avatarUrl: string | null;
};

/** Live counts (4 count queries). Public and safe: numbers only. */
export async function getPlatformStats(): Promise<PlatformStatsDTO> {
  const [activeStudents, publishedCourses, instructors, lessonsCompleted] = await Promise.all([
    repo.countActiveStudents(),
    repo.countPublishedCourses(),
    repo.countApprovedInstructors(),
    repo.countCompletedLessons(),
  ]);
  return { activeStudents, publishedCourses, instructors, lessonsCompleted };
}

export async function getFaculty(limit = 4): Promise<FacultyMemberDTO[]> {
  const rows = await repo.listPublicFaculty(Math.min(Math.max(limit, 1), 12));
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    headline: u.instructorProfile?.headline ?? null,
    avatarUrl: u.avatarAssetId ? publicAssetUrl(u.avatarAssetId) : u.avatar,
  }));
}
