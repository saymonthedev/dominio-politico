import type { SupabaseClient } from "@supabase/supabase-js";

/** O conjunto de chaves no formato que getClaims aceita. */
type Jwks = NonNullable<NonNullable<Parameters<SupabaseClient["auth"]["getClaims"]>[1]>["jwks"]>;

/**
 * Chave PÚBLICA de verificação do login do projeto (a mesma de /auth/v1/.well-known/jwks.json, que é
 * aberta a qualquer um). Com ela embutida, conferir o login não depende de buscar a chave no servidor
 * de login a cada servidor novo: em 19/11, com o banco engasgado, essa busca levava até 50 s e as telas
 * estouravam o limite de 60 s. Se a chave for trocada no Supabase (rotação), o token novo traz outro
 * `kid` e a biblioteca volta a buscar a chave no servidor sozinha.
 */
export const PUBLIC_JWKS: Jwks = {
  keys: [
  {
    "kty": "EC",
    "crv": "P-256",
    "x": "GzmkhoKNY7BkVmfEgvz2W9NZPXySLgsSzuQP6tBW-88",
    "y": "PNiG7snqmSAA6ABfSQ9jsgnStR0yfyhBDUCOMrgi1P0",
    "kid": "232b4365-9d0a-43d1-a731-3663774d274e",
    "alg": "ES256",
    "use": "sig",
    "key_ops": [
      "verify"
    ],
    "ext": true
  }
],
};
