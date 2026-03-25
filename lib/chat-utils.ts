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
