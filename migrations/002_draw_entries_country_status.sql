-- Ejecutar en el SQL Editor de Supabase para agregar los campos nuevos
alter table draw_entries add column if not exists country text;
alter table draw_entries add column if not exists status text; -- 'Q', 'PR', 'LL' o null si es cabeza de serie numerado
