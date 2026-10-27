"use client";
import { useRouter } from "next/navigation";
import { Select, type Option } from "./forms";

/** Seletor que navega ao escolher (filtros de página por URL). */
export function NavSelect({ label, options, value, hrefFor }: { label: string; options: Option[]; value: string; hrefFor: Record<string, string> }) {
  const router = useRouter();
  return <Select name="_nav" label={label} options={options} defaultValue={value} onChange={(v) => hrefFor[v] && router.push(hrefFor[v])} />;
}
