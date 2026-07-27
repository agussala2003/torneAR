-- conversation_reads: tracks last_read_at per user per conversation
create table conversation_reads (
  profile_id       uuid not null references profiles(id) on delete cascade,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  primary key (profile_id, conversation_id)
);

alter table conversation_reads enable row level security;

create policy "reads_own_rows"
  on conversation_reads for all
  using (
    profile_id = (select id from profiles where auth_user_id = auth.uid())
  )
  with check (
    profile_id = (select id from profiles where auth_user_id = auth.uid())
  );

create index conversation_reads_profile_idx on conversation_reads (profile_id);
