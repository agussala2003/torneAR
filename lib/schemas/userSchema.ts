import * as z from 'zod';

export const userProfileSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos (_) sin espacios'),
  zone: z.string().min(1, 'Debes seleccionar una zona'),
  position: z.enum(['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO']),
});

export type UserProfileFormData = z.infer<typeof userProfileSchema>;
