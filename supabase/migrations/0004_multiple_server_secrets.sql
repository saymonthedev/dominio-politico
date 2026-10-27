-- Aceita mais de um segredo de servidor (ex.: um para desenvolvimento local e
-- outro para a Vercel). Cada ambiente registra o hash do seu SIM_SECRET:
--   insert into private.app_secrets (name, hash)
--   values ('vercel', encode(extensions.digest('VALOR', 'sha256'), 'hex'));
create or replace function private.check_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.app_secrets
    where hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;
