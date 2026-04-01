// tornear/lib/schemas/userSchema.ts
import * as z from 'zod';

export const userProfileSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  username: z
    .string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos (_) sin espacios'),
  zone: z.string().min(1, 'Debes seleccionar una zona'),
  position: z.enum(['CUALQUIERA', 'ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO']),
  dateOfBirth: z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Formato DD/MM/YYYY requerido')
    .refine((val) => {
      const [dd, mm, yyyy] = val.split('/').map(Number);
      const d = new Date(yyyy, mm - 1, dd);
      return (
        d.getFullYear() === yyyy &&
        d.getMonth() === mm - 1 &&
        d.getDate() === dd
      );
    }, 'Fecha inválida'),
  gender: z.enum(['M', 'F', 'X'], { error: 'Selecciona un género' }),
  strongFoot: z.enum(['RIGHT', 'LEFT', 'BOTH'], {
    error: 'Selecciona tu pierna hábil',
  }),
  favoriteTeam: z.string().max(50, 'Máximo 50 caracteres').optional(),
});

export type UserProfileFormData = z.infer<typeof userProfileSchema>;
