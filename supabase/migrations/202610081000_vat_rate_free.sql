-- The electrician chooses the IVA before creating the client PDF: Senza IVA (0), 4, 10, 22 or any
-- other rate he types ("Altro"). NULL = not chosen yet (new quotes).
alter table public.quotes drop constraint quotes_vat_rate_check;
alter table public.quotes alter column vat_rate drop not null;
alter table public.quotes alter column vat_rate set default null;
alter table public.quotes add constraint quotes_vat_rate_check check (vat_rate is null or (vat_rate >= 0 and vat_rate <= 100));
