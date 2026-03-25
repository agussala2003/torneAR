import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface NewMessage {
  id: string;
  conversation_id: string;
  sender_profile_id: string;
  sender_team_id: string | null;
  content: string;
}

interface TeamMemberRow {
  profile_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  expo_push_token: string | null;
}

interface TeamRow {
  name: string;
}

interface ConversationRow {
  type: string;
  player_id: string;
  team_id: string;
}

interface ExpoTicket {
  status: string;
  details?: { error?: string };
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const message: NewMessage = payload.record;

  // 1. Get conversation to verify type and get player_id / team_id
  const { data: convo, error: convoErr } = await supabase
    .from('conversations')
    .select('type, player_id, team_id')
    .eq('id', message.conversation_id)
    .single();

  if (convoErr || !convo || (convo as ConversationRow).type !== 'MARKET_DM') {
    return new Response('not a MARKET_DM', { status: 200 });
  }

  const conversation = convo as ConversationRow;

  // 2. Determine recipients
  let recipientProfileIds: string[] = [];

  if (!message.sender_team_id) {
    // Sent by the player → notify CAPITAN + SUBCAPITAN of the team
    const { data: managers } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', conversation.team_id)
      .in('role', ['CAPITAN', 'SUBCAPITAN']);

    recipientProfileIds = ((managers ?? []) as TeamMemberRow[]).map((m) => m.profile_id);
  } else {
    // Sent by the team → notify the player
    recipientProfileIds = [conversation.player_id];
  }

  // 3. Exclude the sender
  recipientProfileIds = recipientProfileIds.filter((id) => id !== message.sender_profile_id);

  if (recipientProfileIds.length === 0) {
    return new Response('no recipients', { status: 200 });
  }

  // 4. Get sender name for notification title
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', message.sender_profile_id)
    .single();

  let senderName = (senderProfile as ProfileRow | null)?.full_name ?? 'Alguien';

  if (message.sender_team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', message.sender_team_id)
      .single();
    senderName = (team as TeamRow | null)?.name ?? senderName;
  }

  const title = `Nuevo mensaje de ${senderName}`;
  const body = message.content.length > 80 ? message.content.slice(0, 77) + '...' : message.content;

  // 5. Get push tokens for all recipients
  const { data: recipients } = await supabase
    .from('profiles')
    .select('id, full_name, expo_push_token')
    .in('id', recipientProfileIds)
    .not('expo_push_token', 'is', null);

  if (!recipients || recipients.length === 0) {
    return new Response('no push tokens', { status: 200 });
  }

  const typedRecipients = recipients as ProfileRow[];

  // 6. Send push notifications via Expo Push API
  const pushMessages = typedRecipients.map((r) => ({
    to: r.expo_push_token,
    title,
    body,
    data: { conversation_id: message.conversation_id, type: 'MARKET_DM' },
  }));

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pushMessages),
  });

  if (!expoResponse.ok) {
    console.error('Expo push API error:', expoResponse.status);
    return new Response('expo push failed', { status: 200 });
  }

  const expoResult = await expoResponse.json();
  const ticketData: ExpoTicket[] = expoResult.data ?? [];

  // 7. Handle stale tokens + insert notifications
  const notificationInserts: object[] = [];

  for (let i = 0; i < typedRecipients.length; i++) {
    const recipient = typedRecipients[i];
    const ticket = ticketData[i];

    if (!ticket) continue;

    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      // Clear stale token
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', recipient.id);
      continue;
    }

    if (ticket.status === 'ok') {
      notificationInserts.push({
        profile_id: recipient.id,
        type: 'MENSAJE_NUEVO',
        title,
        body,
        data: { conversation_id: message.conversation_id },
        is_read: false,
      });
    }
  }

  if (notificationInserts.length > 0) {
    await supabase.from('notifications').insert(notificationInserts);
  }

  return new Response('ok', { status: 200 });
});
