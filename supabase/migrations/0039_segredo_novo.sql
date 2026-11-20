-- Troca do SIM_SECRET (20/11), parte 1: o banco passa a aceitar também o segredo novo.
-- Só o hash (sha256) fica aqui; o valor foi gerado sem ser exibido e vai direto para a Vercel.
-- Os dois valem até a publicação com o segredo novo estar no ar; depois, a parte 2 apaga o antigo
-- (vercel-pro).
insert into private.app_secrets (name, hash)
values ('vercel-pro-2026-11', 'bcdd14f751b6d2a4f74dc0bb4d809d96b0ebadd7e8a19abcca578fdc65070a9c')
on conflict (name) do update set hash = excluded.hash;
