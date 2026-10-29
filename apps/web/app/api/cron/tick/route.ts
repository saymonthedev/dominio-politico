import { NextResponse, type NextRequest } from "next/server";
import { START_YEARS } from "@dp/engine";
import { SITE_URL } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { advanceWorld, logError, runMaintenance, worldExists, worldIdFor, yearOfWorld, type MaintenanceResult } from "@/lib/sim";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** tempo total para avançar os mundos; o resto fica para a manutenção */
const TICK_BUDGET_MS = 40_000;

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function warnMail(w: MaintenanceResult["warn"][number]) {
  const year = yearOfWorld(w.world);
  const link = `${SITE_URL}/jogo/${year}`;
  const subject = "Seu mundo próprio vai ser apagado · Domínio Político";
  const text = `Seu mundo próprio pós-${year} está parado desde ${fmt(w.last_active)}. Mundos próprios sem uso por 90 dias são apagados para liberar espaço. Se quiser mantê-lo, basta entrar e jogar até ${fmt(w.delete_after)}: ${link}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#12161d">
  <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7d5c0e">Domínio Político</p>
  <h1 style="margin:0 0 14px;font-size:22px;color:#0b1f3a">Seu mundo pós-${year} está parado</h1>
  <p style="font-size:15px;line-height:24px;color:#3d434e">Ninguém joga nele desde <b>${fmt(w.last_active)}</b>. Mundos próprios sem uso por 90 dias são apagados para liberar espaço para outros jogadores.</p>
  <p style="font-size:15px;line-height:24px;color:#3d434e">Para manter o mundo, é só entrar e fazer qualquer ação até <b>${fmt(w.delete_after)}</b>.</p>
  <p style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#d4a53c;color:#0b1f3a;font-weight:700;text-decoration:none">Voltar ao meu mundo &rarr;</a></p>
  <p style="font-size:12px;color:#7a8190">Se não quiser mais o mundo, não precisa fazer nada.</p>
</div>`;
  return { subject, html, text };
}

/**
 * Tarefa diária (Vercel Cron, vercel.json): avança os mundos compartilhados,
 * poda dados antigos e cuida dos mundos próprios parados (aviso e remoção).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? process.env.SIM_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const ticks: Record<string, number | string> = {};
  for (const y of START_YEARS) {
    if (Date.now() - started > TICK_BUDGET_MS) break;
    try {
      if (!(await worldExists(worldIdFor(y)))) continue;
      // em blocos até alcançar o relógio ou acabar o tempo (o que faltar fica para amanhã ou para o próximo jogador)
      let total = 0;
      for (;;) {
        const t = await advanceWorld(y, 45);
        total += t;
        if (t < 45 || Date.now() - started > TICK_BUDGET_MS) break;
      }
      ticks[y] = total;
    } catch (e) {
      ticks[y] = e instanceof Error ? e.message : "erro";
      await logError("cron", `/api/cron/tick#${y}`, e);
    }
  }

  let maintenance: Omit<MaintenanceResult, "warn"> & { warned: number; mailed: number } = { news: 0, events: 0, notifications: 0, dropped: [], warned: 0, mailed: 0 };
  try {
    const m = await runMaintenance();
    let mailed = 0;
    for (const w of m.warn) {
      const mail = warnMail(w);
      try {
        if (await sendMail(w.email, mail.subject, mail.html, mail.text)) mailed++;
      } catch (e) {
        await logError("cron", "/api/cron/tick#aviso", e);
      }
    }
    maintenance = { news: m.news, events: m.events, notifications: m.notifications, dropped: m.dropped, warned: m.warn.length, mailed };
  } catch (e) {
    await logError("cron", "/api/cron/tick#manutencao", e);
  }
  return NextResponse.json({ ok: true, ticks, maintenance });
}
