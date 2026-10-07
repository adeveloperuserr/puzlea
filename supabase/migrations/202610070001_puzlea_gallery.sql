-- Public submissions stay private until an administrator approves them in Supabase Dashboard.

create table if not exists public.gallery_puzzles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text check (description is null or char_length(description) <= 240),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint gallery_path_matches_owner check (storage_path like author_id::text || '/%')
);

create index if not exists gallery_puzzles_public_order
  on public.gallery_puzzles (created_at desc) where status = 'approved';
create index if not exists gallery_puzzles_owner_order
  on public.gallery_puzzles (author_id, created_at desc);

alter table public.gallery_puzzles enable row level security;

drop policy if exists "moderators review puzzles" on public.gallery_puzzles;
drop policy if exists "read approved or owned puzzles" on public.gallery_puzzles;
drop policy if exists "read approved or own gallery image" on storage.objects;
revoke update (status, reviewed_at, reviewed_by) on public.gallery_puzzles from authenticated;
drop function if exists public.is_puzlea_moderator();

grant select (id, author_id, title, description, storage_path, status, created_at, reviewed_at) on public.gallery_puzzles to anon, authenticated;
grant insert (author_id, title, description, storage_path, status) on public.gallery_puzzles to authenticated;
grant delete on public.gallery_puzzles to authenticated;

drop policy if exists "read approved or owned puzzles" on public.gallery_puzzles;
create policy "read approved or owned puzzles"
  on public.gallery_puzzles for select
  to anon, authenticated
  using (status = 'approved' or author_id = (select auth.uid()));

drop policy if exists "submit pending puzzle" on public.gallery_puzzles;
create policy "submit pending puzzle"
  on public.gallery_puzzles for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and storage_path like (select auth.uid())::text || '/%'
  );

drop policy if exists "delete own pending puzzle" on public.gallery_puzzles;
create policy "delete own pending puzzle"
  on public.gallery_puzzles for delete
  to authenticated
  using (author_id = (select auth.uid()) and status = 'pending');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-images', 'gallery-images', false, 20971520, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['image/jpeg'];

drop policy if exists "upload own gallery image" on storage.objects;
create policy "upload own gallery image"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gallery-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.gallery_puzzles as puzzle
      where puzzle.storage_path = name
        and puzzle.author_id = (select auth.uid())
        and puzzle.status = 'pending'
    )
  );

drop policy if exists "read approved or own gallery image" on storage.objects;
create policy "read approved or own gallery image"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'gallery-images'
    and exists (
      select 1
      from public.gallery_puzzles as puzzle
      where puzzle.storage_path = storage.objects.name
        and (puzzle.status = 'approved' or puzzle.author_id = (select auth.uid()))
    )
  );

drop policy if exists "delete own gallery image" on storage.objects;
create policy "delete own gallery image"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gallery-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
      from public.gallery_puzzles as puzzle
      where puzzle.storage_path = storage.objects.name
        and puzzle.status = 'approved'
    )
  );
