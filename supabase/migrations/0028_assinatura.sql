-- Assinatura mensal (13/11): R$ 3 por 30 dias de jogo, por Pix pelo Mercado Pago.
-- A assinatura de cada conta é só a data até quando ela vale. Cada pagamento aprovado soma 30 dias,
-- a partir de agora ou do fim da assinatura em vigor (o que vier depois); estorno ou contestação
-- tira os 30 dias de volta. O servidor confere o pagamento no próprio Mercado Pago antes de
-- registrar, e o registro é idempotente pelo id do pagamento (o aviso do Mercado Pago e a
-- conferência da tela podem chegar juntos).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paid_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "assinatura propria" on public.subscriptions;
create policy "assinatura propria" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;

-- pagamentos (para conferência e estorno); some o vínculo com a conta se ela for apagada
create table if not exists private.payments (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  amount numeric(10, 2) not null,
  status text not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  credited boolean not null default false
);
create index if not exists payments_user_idx on private.payments (user_id);

create or replace function public.pay_register(p_secret text, p_payment text, p_user uuid, p_amount numeric, p_status text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  changed boolean;
  until timestamptz;
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
      values (p_user, now() + interval '30 days', now())
      on conflict (user_id) do update
        set paid_until = greatest(public.subscriptions.paid_until, now()) + interval '30 days', updated_at = now();
    end if;
  elsif p_status in ('refunded', 'charged_back', 'cancelled') then
    -- devolvido ou contestado depois de creditado: os 30 dias saem
    update private.payments set credited = false where id = p_payment and credited returning true into changed;
    if coalesce(changed, false) then
      update public.subscriptions set paid_until = paid_until - interval '30 days', updated_at = now() where user_id = p_user;
    end if;
  end if;

  select s.paid_until into until from public.subscriptions s where s.user_id = p_user;
  return until;
end $$;
revoke all on function public.pay_register(text, text, uuid, numeric, text) from public;
grant execute on function public.pay_register(text, text, uuid, numeric, text) to anon, authenticated;
