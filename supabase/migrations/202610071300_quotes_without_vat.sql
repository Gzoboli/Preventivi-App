-- Quotes start without IVA (vat_rate 0 = "Senza IVA"); the electrician adds 4/10/22% later if needed.
alter table public.quotes drop constraint quotes_vat_rate_check;
alter table public.quotes add constraint quotes_vat_rate_check check (vat_rate = any (array[0, 4, 10, 22]::numeric[]));
alter table public.quotes alter column vat_rate set default 0;
