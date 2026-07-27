// tornear/lib/schemas/userSchema.ts
import * as z from 'zod';
import { isValidFavoriteTeam } from '@/lib/favorite-teams';

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
  /**
   * Obligatorio y acotado al catalogo.
   *
   * Se valida con `.refine` sobre string y NO con `z.enum`: los perfiles
   * existentes tienen texto libre del input viejo (el seed guarda 'Boca',
   * 'River'). Con enum, ese valor no seria ni asignable al tipo ni hidratable
   * en el form. Con refine sigue siendo un string valido para el defaultValue,
   * y solo falla al GUARDAR — que es cuando el usuario ve el error y elige del
   * select. La migracion de datos viejos ocurre asi, sin bloquear a nadie.
   */
  favoriteTeam: z
    .string()
    .min(1, 'Selecciona tu cuadro favorito')
    .refine(isValidFavoriteTeam, { message: 'Selecciona un equipo de la lista' }),
});

export type UserProfileFormData = z.infer<typeof userProfileSchema>;
