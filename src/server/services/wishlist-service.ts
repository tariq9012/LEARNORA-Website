import * as wishlistRepository from "../repositories/wishlist-repository";
import * as courseRepository from "../repositories/course-repository";
import { mapCourseToCardDTO } from "./course-mapper";
import type { SafeUser } from "../auth/types";
import type { CourseCardDTO } from "../dto/course";

export class WishlistError extends Error {}

export async function addToWishlist(user: SafeUser, courseSlug: string): Promise<void> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) throw new WishlistError("Course not found.");
  await wishlistRepository.addWishlistItem(user.id, course.id);
}

export async function removeFromWishlist(user: SafeUser, courseSlug: string): Promise<void> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) return; // already effectively "not in wishlist" — nothing to do
  await wishlistRepository.removeWishlistItem(user.id, course.id);
}

export async function isWishlisted(user: SafeUser | null, courseSlug: string): Promise<boolean> {
  if (!user) return false;
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) return false;
  const item = await wishlistRepository.findWishlistItem(user.id, course.id);
  return item !== null;
}

export async function getMyWishlist(user: SafeUser): Promise<CourseCardDTO[]> {
  const rows = await wishlistRepository.listWishlistForUser(user.id);
  return rows.map((row) => mapCourseToCardDTO(row.course));
}
