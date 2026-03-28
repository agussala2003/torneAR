import { TeamRole } from '@/lib/team-options';

export function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function firstLetterUpper(text: string): string {
  const normalized = text.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function requestStatusChip(status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'): { label: string; className: string } {
  if (status === 'ACEPTADA') {
    return { label: 'Aceptada', className: 'bg-brand-primary/15 text-brand-primary' };
  }
  if (status === 'RECHAZADA') {
    return { label: 'Rechazada', className: 'bg-danger-error/15 text-danger-error' };
  }
  return { label: 'Pendiente', className: 'bg-info-secondary/15 text-info-secondary' };
}

export function roleAppearance(role: TeamRole): { badgeBackground: string; badgeText: string; borderColor: string; } {
  if (role === 'CAPITAN') {
    return { badgeBackground: '#F4C5421F', badgeText: '#F4C542', borderColor: '#F4C542' };
  }
  if (role === 'SUBCAPITAN') {
    return { badgeBackground: '#A5B7A726', badgeText: '#A5B7A7', borderColor: '#A5B7A7' };
  }
  if (role === 'DIRECTOR_TECNICO') {
    return { badgeBackground: '#8CCDFF1F', badgeText: '#8CCDFF', borderColor: '#8CCDFF' };
  }
  return { badgeBackground: '#53E07624', badgeText: '#53E076', borderColor: '#53E076' };
}

export function canManageMember(currentUserRole: TeamRole | null, memberRole: TeamRole, isSelf: boolean): boolean {
  if (!currentUserRole || isSelf) {
    return false;
  }
  if (currentUserRole === 'CAPITAN') {
    return memberRole !== 'CAPITAN';
  }
  if (currentUserRole === 'SUBCAPITAN') {
    return memberRole === 'JUGADOR' || memberRole === 'DIRECTOR_TECNICO';
  }
  return false;
}

export function allowedRolesToAssign(currentUserRole: TeamRole | null): TeamRole[] {
  if (currentUserRole === 'CAPITAN') {
    // CAPITAN puede asignar su propio rol a otro (ceder capitanía, quedando como SUBCAPITÁN)
    return ['CAPITAN', 'SUBCAPITAN', 'JUGADOR', 'DIRECTOR_TECNICO'];
  }
  if (currentUserRole === 'SUBCAPITAN') {
    return ['JUGADOR', 'DIRECTOR_TECNICO'];
  }
  return [];
}
