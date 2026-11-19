-- Para o Domínio Político se pagar (19/11): plano anual, convite de amigos e números de retenção.
--
-- Plano anual: R$ 29,90 por 365 dias. O valor conferido no próprio Mercado Pago diz o plano: a
-- partir de R$ 29, o pagamento soma 365 dias; abaixo disso (os Pix de R$ 3 e de R$ 3,50), 30 dias.
-- Devolução ou contestação tira os mesmos dias. Quem já pagou não muda nada.
--
-- Convite: cada conta tem um código. Conta nova que chega pelo link de convite fica ligada a quem
-- convidou; quando ela faz o primeiro pagamento, quem convidou ganha 7 dias (uma vez por amigo).
-- Sem pagamento não há prêmio, então contas falsas não rendem nada.
--
-- Retenção: o painel /admin passa a mostrar contas novas, quem criou personagem, quem voltou depois
-- do primeiro dia, teste grátis que virou assinatura, assinantes, receita e convites.

set local lock_timeout = '5s';

create table if not exists private.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists private.referrals (
  invited uuid primary key references auth.users (id) on delete cascade,
  inviter uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_inviter_idx on private.referrals (inviter);

-- dias que um pagamento vale, pelo valor pago
create or replace function private.pay_days(p_amount numeric)
returns int language sql immutable set search_path = '' as $$
  select case when p_amount >= 29 then 365 else 30 end
$$;

create or replace function public.pay_register(p_secret text, p_payment text, p_user uuid, p_amount numeric, p_status text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  changed boolean;
  until timestamptz;
  n_days int := private.pay_days(p_amount);
  inviter_id uuid;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.payments (id, user_id, amount, status, approved_at)
  values (p_payment, p_user, p_amount, p_status, case when p_status = 'approved' then now() end)
  on conflict (id) do update
    set status = excluded.status,
        approved_at = coalesce(private.payments.approved_at, excluded.approved_at);

  if p_status = 'approved' then
    -- credita uma vez só por pagamento (a trava da linha segura duas conferências ao mesmo tempo)
    update private.payments set credited = true where id = p_payment and not credited returning true into changed;
    if coalesce(changed, false) then
      insert into public.subscriptions (user_id, paid_until, updated_at)
      values (p_user, now() + make_interval(days => n_days), now())
      on conflict (user_id) do update
        set paid_until = greatest(public.subscriptions.paid_until, now()) + make_interval(days => n_days), updated_at = now();
      -- primeiro pagamento de quem chegou por convite: quem convidou ganha 7 dias
      if not exists (select 1 from private.payments x where x.user_id = p_user and x.credited and x.id <> p_payment) then
        select r.inviter into inviter_id from private.referrals r
         where r.invited = p_user and r.rewarded_at is null and r.inviter is not null and r.inviter <> p_user
         for update;
        if inviter_id is not null then
          insert into public.subscriptions (user_id, paid_until, updated_at)
          values (inviter_id, now() + interval '7 days', now())
          on conflict (user_id) do update
            set paid_until = greatest(public.subscriptions.paid_until, now()) + interval '7 days', updated_at = now();
          update private.referrals set rewarded_at = now() where invited = p_user;
        end if;
      end if;
    end if;
  elsif p_status in ('refunded', 'charged_back', 'cancelled') then
    -- devolvido ou contestado depois de creditado: os dias do pagamento saem
    update private.payments set credited = false where id = p_payment and credited returning true into changed;
    if coalesce(changed, false) then
      update public.subscriptions set paid_until = paid_until - make_interval(days => n_days), updated_at = now() where user_id = p_user;
    end if;
  end if;

  select s.paid_until into until from public.subscriptions s where s.user_id = p_user;
  return until;
end $$;
revoke all on function public.pay_register(text, text, uuid, numeric, text) from public;
grant execute on function public.pay_register(text, text, uuid, numeric, text) to anon, authenticated;

-- código de convite da conta (criado na primeira vez)
create or replace function public.referral_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c text;
  n int := 7;
begin
  if uid is null then return null; end if;
  select r.code into c from private.referral_codes r where r.user_id = uid;
  if c is not null then return c; end if;
  loop
    c := upper(substr(encode(extensions.digest(uid::text || ':convite', 'sha256'), 'hex'), 1, n));
    begin
      insert into private.referral_codes (user_id, code) values (uid, c);
      return c;
    exception when unique_violation then
      -- a conta acabou de ganhar o código em outra aba, ou outro código igual já existe: mais letras
      select r.code into c from private.referral_codes r where r.user_id = uid;
      if c is not null then return c; end if;
      n := n + 1;
      if n > 20 then raise exception 'sem código de convite livre'; end if;
    end;
  end loop;
end $$;
revoke all on function public.referral_code() from public;
grant execute on function public.referral_code() to authenticated;

-- conta nova (até 3 dias, sem pagamento) que chegou pelo link de convite fica ligada a quem convidou
create or replace function public.referral_claim(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  owner uuid;
  born timestamptz;
begin
  if uid is null or p_code is null then return false; end if;
  select r.user_id into owner from private.referral_codes r where r.code = upper(btrim(p_code));
  if owner is null or owner = uid then return false; end if;
  select u.created_at into born from auth.users u where u.id = uid;
  if born is null or born < now() - interval '3 days' then return false; end if;
  if exists (select 1 from private.payments p where p.user_id = uid and p.credited) then return false; end if;
  insert into private.referrals (invited, inviter) values (uid, owner) on conflict (invited) do nothing;
  return found;
end $$;
revoke all on function public.referral_claim(text) from public;
grant execute on function public.referral_claim(text) to authenticated;

-- convites da conta: quantos amigos chegaram e quantos já assinaram (cada um rendeu 7 dias)
create or replace function public.referral_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invited', (select count(*) from private.referrals r where r.inviter = (select auth.uid())),
    'rewarded', (select count(*) from private.referrals r where r.inviter = (select auth.uid()) and r.rewarded_at is not null)
  );
$$;
revoke all on function public.referral_stats() from public;
grant execute on function public.referral_stats() to authenticated;

-- /admin: retenção e receita (contas confirmadas, atividade dos últimos 30 dias pelo índice dos eventos de jogadores)
create or replace function public.admin_retention(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  res jsonb;
begin
  if not private.check_secret(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  with users as (
    select u.id, u.created_at from auth.users u where u.email_confirmed_at is not null
  ),
  owners as (
    select distinct o.user_id from private.person_owners o
  ),
  paid as (
    select p.user_id, p.amount, p.approved_at from private.payments p where p.credited and p.user_id is not null
  ),
  first_paid as (
    select user_id, min(approved_at) as at from paid group by user_id
  ),
  ev as (
    select o.user_id, e.created_at
      from public.worlds w
      cross join lateral (
        select x.actors, x.created_at from public.world_events x
         where x.world_id = w.id and x.type = any (private.player_event_types()) and x.created_at > now() - interval '30 days'
      ) e
      join private.person_owners o on o.world_id = w.id and o.person_id = e.actors[1]
  ),
  -- uma passada só pelos eventos: a última atividade de cada conta e quantas contas jogaram em cada dia
  ev_user as (
    select user_id, max(created_at) as last_at from ev group by user_id
  ),
  ev_day as (
    select (created_at at time zone 'America/Sao_Paulo')::date as d, count(distinct user_id) as n from ev group by 1
  ),
  days as (
    select generate_series((now() at time zone 'America/Sao_Paulo')::date - 13, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day')::date as d
  )
  select jsonb_build_object(
    'accounts', (select count(*) from users),
    'accounts_7d', (select count(*) from users where created_at > now() - interval '7 days'),
    'accounts_30d', (select count(*) from users where created_at > now() - interval '30 days'),
    'with_character', (select count(*) from users u join owners o on o.user_id = u.id),
    'with_character_30d', (select count(*) from users u join owners o on o.user_id = u.id where u.created_at > now() - interval '30 days'),
    -- de quem criou a conta há 2 a 30 dias e jogou: quantos voltaram depois do primeiro dia
    'cohort_30d', (select count(*) from users u join ev_user x on x.user_id = u.id where u.created_at between now() - interval '30 days' and now() - interval '2 days'),
    'returned_30d', (select count(*) from users u join ev_user x on x.user_id = u.id where u.created_at between now() - interval '30 days' and now() - interval '2 days' and x.last_at > u.created_at + interval '1 day'),
    'active_24h', (select count(distinct user_id) from ev where created_at > now() - interval '24 hours'),
    'active_7d', (select count(distinct user_id) from ev where created_at > now() - interval '7 days'),
    'trials', (select count(*) from public.subscriptions s where s.trial_at is not null),
    'trials_paid', (select count(*) from public.subscriptions s join first_paid f on f.user_id = s.user_id where s.trial_at is not null),
    'paying', (select count(*) from public.subscriptions s where s.paid_until > now() + interval '2 hours' and exists (select 1 from first_paid f where f.user_id = s.user_id)),
    'lapsed_30d', (select count(*) from public.subscriptions s where s.paid_until <= now() and s.paid_until > now() - interval '30 days' and exists (select 1 from first_paid f where f.user_id = s.user_id)),
    'revenue_month', (select coalesce(sum(amount), 0) from paid where (approved_at at time zone 'America/Sao_Paulo') >= date_trunc('month', now() at time zone 'America/Sao_Paulo')),
    'revenue_30d', (select coalesce(sum(amount), 0) from paid where approved_at > now() - interval '30 days'),
    'revenue_total', (select coalesce(sum(amount), 0) from paid),
    'payments_30d', (select count(*) from paid where approved_at > now() - interval '30 days'),
    'annual', (select count(*) from paid where amount >= 29),
    'referrals', (select count(*) from private.referrals),
    'referrals_rewarded', (select count(*) from private.referrals where rewarded_at is not null),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'd', d,
        'new', (select count(*) from users u where (u.created_at at time zone 'America/Sao_Paulo')::date = d),
        'played', (select count(*) from users u where (u.created_at at time zone 'America/Sao_Paulo')::date = d and exists (select 1 from owners o where o.user_id = u.id)),
        'paid', (select count(*) from first_paid f where (f.at at time zone 'America/Sao_Paulo')::date = d),
        'active', coalesce((select n from ev_day where ev_day.d = days.d), 0)
      ) order by d)
      from days
    )
  ) into res;
  return res;
end $$;
revoke all on function public.admin_retention(text) from public;
grant execute on function public.admin_retention(text) to anon, authenticated;
