/**
 * Returns true if the conversation has unread messages for the given user.
 */
export function computeUnread(
  last_msg_at: string | null,
  last_msg_sender: string | null,
  last_read_at: string | null,
  myProfileId: string,
): boolean {
  if (!last_msg_at || !last_msg_sender) return false;
  if (last_msg_sender === myProfileId) return false;
  if (!last_read_at) return true;
  return last_msg_at > last_read_at;
}

/**
 * Derives the display role for a message sender.
 * - If senderTeamId is null: the sender is the player side → 'JUGADOR'
 * - If senderTeamId is set: look up their role in the roleMap (team_members for that team)
 *   Returns null if the sender is not found (should not happen in normal flow).
 */
export function deriveRole(
  senderTeamId: string | null,
  senderProfileId: string,
  roleMap: Record<string, string>,
): 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | null {
  if (!senderTeamId) return 'JUGADOR';
  const role = roleMap[senderProfileId];
  if (!role) return null;
  return role as 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR';
}
