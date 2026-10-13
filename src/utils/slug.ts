import { prisma } from '../config/database';

/**
 * Converts a string into an SEO-friendly URL slug.
 */
export function slugify(text: string): string {
  if (!text) return '';

  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // separate accented characters
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks
    .replace(/[^a-z0-9\s-]/g, '') // remove special characters
    .replace(/[\s_-]+/g, '-') // convert spaces and underscores to hyphens
    .replace(/^-+|-+$/g, ''); // remove leading and trailing hyphens
}

/**
 * Generates a guaranteed unique slug for a blog post.
 * If a conflict occurs, it appends an incrementing counter (-1, -2, etc.).
 *
 * @param baseText Title or custom slug text to base the slug on
 * @param excludeBlogId Optional blog ID to exclude (used during updates)
 */
export async function generateUniqueSlug(
  baseText: string,
  excludeBlogId?: string
): Promise<string> {
  const baseSlug = slugify(baseText) || 'blog-post';
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.blog.findFirst({
      where: {
        slug,
        ...(excludeBlogId ? { id: { not: excludeBlogId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}
