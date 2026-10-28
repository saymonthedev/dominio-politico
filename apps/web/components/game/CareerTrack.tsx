import { Icon } from "../Icon";

const STEPS: Array<[string, string]> = [
  ["CIDADAO", "Cidadão"], ["ATIVISTA", "Ativista"], ["APROXIMACAO", "Aproximação"], ["FILIADO", "Filiado"], ["QUADRO", "Quadro"],
  ["PRE_CANDIDATO", "Pré-candidato"], ["CANDIDATO", "Candidato"], ["MANDATO", "Mandato"],
];

/** Trilha de carreira: onde o personagem está entre cidadão e mandato. */
export function CareerTrack({ stage, dark }: { stage: string; dark?: boolean }) {
  const idx = STEPS.findIndex(([k]) => k === stage);
  return (
    <ol className={`ctrack${dark ? " ctrack--dark" : ""}`} aria-label="Etapas da carreira">
      {STEPS.map(([k, label], i) => (
        <li key={k} className={i < idx ? "done" : i === idx ? "now" : ""} aria-current={i === idx ? "step" : undefined}>
          <span className="ctrack__dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="ctrack__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
