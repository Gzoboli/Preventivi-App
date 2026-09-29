-- Series uplift seed (data only; applied via the Supabase connector).
-- uplift_per_point_eur = list-price cost of a typical point above Vimar Plana, from the catalogue
-- (listini 2026): 1 deviatore 16A 1 modulo + half of a 3-module plate and support
-- (≈2 points per box). The app turns the difference between two series into a client price
-- with the electrician's discount and markup. Axolute 1P deviatore is not in the catalogue: estimated at 40 €.
delete from public.series_uplift;
insert into public.series_uplift (marca, serie, tier_hint, uplift_per_point_eur, plate_style, short_description) values
  ('Vimar',   'Plana',   'base',  0.00, 'tecnopolimero', 'Serie economica, placche in tecnopolimero'),
  ('BTicino', 'MATIXGO', 'base',  0.52, 'tecnopolimero', 'Serie economica'),
  ('BTicino', 'MATIX',   'base',  2.97, 'tecnopolimero', 'Serie economica classica'),
  ('Vimar',   'Arké',    'media', 9.06, 'tecnopolimero, metallo, legno', 'Serie di fascia media, molte finiture'),
  ('BTicino', 'LL',      'media', 11.87, 'tecnopolimero, metallo', 'Living Light, fascia media'),
  ('Vimar',   'Linea',   'media', 12.37, 'tecnopolimero, metallo', 'Serie di fascia media, design sottile'),
  ('BTicino', 'L.NOW',   'media', 12.88, 'tecnopolimero, metallo', 'Living Now, fascia media'),
  ('Vimar',   'Idea',    'media', 14.08, 'tecnopolimero, metallo', 'Serie di fascia media (classica)'),
  ('BTicino', 'MAGIC',   'media', 20.17, 'tecnopolimero', 'Serie storica, placche tonde'),
  ('Vimar',   'Eikon',   'top',   24.69, 'tecnopolimero, metallo, vetro, legno, pietra', 'Serie top, finiture pregiate'),
  ('BTicino', 'AXOLUTE', 'top',   57.51, 'metallo, vetro, legno', 'Serie top (deviatore stimato)');
