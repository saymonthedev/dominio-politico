-- Teste grátis (14/11): conta criada depois que a cobrança começou (13/11/2026, 19h45 de Brasília)
-- joga 1 hora de graça, contada da primeira vez que entra no jogo, uma vez por conta. O teste é uma
-- "assinatura" de 1 hora (paid_until) marcada com trial_at: o portão do jogo não muda, e quem paga
-- durante o teste soma os 30 dias ao que ainda falta. Contas de antes da cobrança já conheceram o
-- jogo de graça e não ganham o teste.

alter table public.subscriptions add column if not exists trial_at timestamptz;

create or replace function public.trial_start()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  born timestamptz;
  until timestamptz;
begin
  if uid is null then return null; end if;
  -- já assinou ou já usou o teste: vale o que está gravado (mesmo vencido)
  select s.paid_until into until from public.subscriptions s where s.user_id = uid;
  if found then return until; end if;
  select u.created_at into born from auth.users u where u.id = uid;
  if born is null or born < timestamptz '2026-11-13 22:45:00+00' then return null; end if;
  insert into public.subscriptions (user_id, paid_until, trial_at, updated_at)
  values (uid, now() + interval '1 hour', now(), now())
  on conflict (user_id) do nothing;
  select s.paid_until into until from public.subscriptions s where s.user_id = uid;
  return until;
end $$;
revoke all on function public.trial_start() from public;
grant execute on function public.trial_start() to authenticated;
