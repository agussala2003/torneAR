import { supabase } from './supabase';

/**
 * Get a public URL for a file in a Supabase storage bucket
 * Handles both direct URLs and paths that need to be signed
 */
export function getSupabaseStorageUrl(bucketName: string, filePath: string): string {
  if (!filePath) return '';

  // Si la URL ya es completa (empieza con http), devolver como está
  if (filePath.startsWith('http')) {
    return filePath;
  }

  // Construir URL pública del bucket
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);

  return data?.publicUrl || '';
}

/**
 * Get avatar URL from storage
 */
export function getAvatarUrl(userId: string): string {
  if (!userId) return '';
  const avatarPath = `${userId}/avatar.jpg`;
  return getSupabaseStorageUrl('avatars', avatarPath);
}

/**
 * Get team shield URL from storage
 */
export function getShieldUrl(teamId: string): string {
  if (!teamId) return '';
  const shieldPath = `${teamId}/shield.png`;
  return getSupabaseStorageUrl('shields', shieldPath);
}

/**
 * Get badge icon URL from storage
 */
export function getBadgeIconUrl(badgeSlug: string): string {
  if (!badgeSlug) return '';
  const iconPath = `${badgeSlug}.png`;
  return getSupabaseStorageUrl('badges', iconPath);
}
