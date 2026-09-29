-- Quote numbers per electrician and per year (2026/001, 2026/002, …) instead of one global counter.
-- The number is always set by the trigger; anything sent by the client is ignored.

alter table public.quotes add column quote_year int not null default extract(year from now())::int;
alter table public.quotes alter column quote_number drop default;
drop sequence if exists public.quotes_quote_number_seq;

create or replace function public.set_quote_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.quote_year := extract(year from coalesce(new.created_at, now()))::int;
  -- serialise concurrent inserts of the same user/year
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.quote_year::text));
  select coalesce(max(q.quote_number), 0) + 1 into new.quote_number
  from public.quotes q
  where q.user_id = new.user_id and q.quote_year = new.quote_year;
  return new;
end; $$;
revoke execute on function public.set_quote_number() from public, anon, authenticated;

create trigger quotes_number before insert on public.quotes
  for each row execute function public.set_quote_number();

alter table public.quotes add constraint quotes_user_year_number_key unique (user_id, quote_year, quote_number);
