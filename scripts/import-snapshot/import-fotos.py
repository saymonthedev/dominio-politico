"""
Fotos reais de quem tem cargo no ponto de partida (presidente, governadores,
senadores, deputados federais, candidatos majoritários e prefeitos de capitais).

Fonte: Dados Abertos do TSE, "Fotos de candidatos" (CC-BY), a partir de 2004.
Os zips do TSE têm gigabytes; aqui só o índice e as fotos necessárias são
baixados, por requisições parciais (HTTP Range).

Quem disputou só antes de 2004 recebe a foto da mesma pessoa numa eleição
seguinte (mesmo nome completo e data de nascimento, ou mesmo CPF; o CPF é usado
só em memória para casar registros e nunca é gravado).

Saída: apps/web/public/fotos/<id TSE>.webp e apps/web/lib/photos.json
Uso: python3 scripts/import-snapshot/import-fotos.py
"""
import csv
import io
import json
import os
import re
import ssl
import subprocess
import sys
import unicodedata
import urllib.request
import zipfile
from collections import OrderedDict, defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/fotos"
MANIFEST = ROOT / "apps/web/lib/photos.json"
ZIPS = ROOT / ".cache/tse/zips"
YEARS = [2002, 2006, 2010, 2014, 2018, 2022, 2026]
FIRST_PHOTO_YEAR = 2004
SIZE = (120, 150)

ca = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
CTX = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
csv.field_size_limit(10_000_000)


class HttpFile(io.RawIOBase):
    """Arquivo remoto somente leitura com busca aleatória via HTTP Range."""

    BLOCK = 1 << 20

    def __init__(self, url):
        self.url = url
        self.pos = 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), context=CTX, timeout=60) as r:
            self.size = int(r.headers["Content-Length"])
        self.cache = OrderedDict()

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def _block(self, b):
        if b in self.cache:
            self.cache.move_to_end(b)
            return self.cache[b]
        start = b * self.BLOCK
        end = min(self.size, start + self.BLOCK) - 1
        for attempt in range(4):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}"})
                with urllib.request.urlopen(req, context=CTX, timeout=120) as r:
                    data = r.read()
                break
            except Exception:
                if attempt == 3:
                    raise
        self.cache[b] = data
        if len(self.cache) > 64:
            self.cache.popitem(last=False)
        return data

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        end = min(self.size, self.pos + n)
        out = bytearray()
        while self.pos < end:
            b = self.pos // self.BLOCK
            blk = self._block(b)
            off = self.pos - b * self.BLOCK
            take = min(end - self.pos, len(blk) - off)
            out += blk[off : off + take]
            self.pos += take
        return bytes(out)

    def readinto(self, buf):
        data = self.read(len(buf))
        buf[: len(data)] = data
        return len(data)


def photo_index(zf):
    """Nome do arquivo por candidatura: "SQ" (2006+) ou "UE_SQ" (2004, SQ só é único por município)."""
    names = {}
    for n in zf.namelist():
        base = n.split("/")[-1]
        m = re.match(r"^F[A-Z]{2}(\d+)_(\d+)_div\.(jpe?g|png)$", base, re.I)
        if m:
            names[f"{int(m.group(1))}_{int(m.group(2))}"] = n
            continue
        m = re.match(r"^F[A-Z]{2}(\d+)_div\.(jpe?g|png)$", base, re.I)
        if m:
            names[m.group(1)] = n
    return names


def photo_url(year, uf):
    return f"https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes{year}/fotos/foto_cand{year}_{uf}_div.zip"


def save_photo(raw, dest):
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    target = SIZE[0] / SIZE[1]
    if w / h > target:
        nw = int(h * target)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        top = max(0, int((h - nh) * 0.2))  # rosto costuma ficar no terço de cima
        img = img.crop((0, top, w, top + nh))
    img = img.resize(SIZE, Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=72, method=6)


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip().upper()


def needed_ids():
    """
    Quem precisa de foto: {id como a pessoa guarda (external_ref): (ano, UF, SQ_CANDIDATO)}.
    O id é "2022-SP-250001612345" nos snapshots históricos e o SQ puro no de 2026.
    """
    ids = {}

    def add(sq, year, uf):
        m = re.match(r"^(\d{4})-([A-Z]{2})-(\d+)$", str(sq))
        ids[str(sq)] = (int(m.group(1)), m.group(2), m.group(3)) if m else (year, uf, str(sq))

    for y in YEARS:
        snap = json.loads((ROOT / f"data/snapshot-{y}.json").read_text())
        for r in snap["races"]:
            for c in r["candidates"]:
                if r["office"] in ("PRESIDENTE", "GOVERNADOR", "SENADOR") or (r["office"] == "DEP_FEDERAL" and c.get("elected")):
                    # Presidência: a foto fica no zip nacional, mesmo nas disputas por UF
                    add(c["sq"], y, "BR" if r["office"] == "PRESIDENTE" else r["geo"])
        for sen in snap.get("senatorsContinuing", []):
            add(sen["sq"], y - 4, sen.get("uf", ""))
        if snap.get("incumbentPresident"):
            add(snap["incumbentPresident"]["sq"], y - 4, "BR")
        mun = json.loads((ROOT / f"data/municipios-{y}.json").read_text())
        for m in mun["municipalities"]:
            if m["capital"] and m["mayor"] and m["mayor"].get("sq"):
                add(m["mayor"]["sq"], y - 2, m["uf"])
    return ids


def fetch_direct(ids, have):
    """Busca cada foto no zip do ano/UF do próprio registro."""
    groups = defaultdict(dict)
    for tid, (y, uf, sq) in ids.items():
        if y >= FIRST_PHOTO_YEAR and tid not in have:
            groups[(y, uf)][sq] = tid
    for (y, uf), sqs in sorted(groups.items()):
        try:
            zf = zipfile.ZipFile(HttpFile(photo_url(y, uf)))
        except Exception as e:
            print(f"  sem zip {y} {uf}: {e}")
            continue
        names = photo_index(zf)
        got = 0
        for sq, tid in sqs.items():
            n = names.get(sq)
            if not n:
                continue
            try:
                save_photo(zf.read(n), OUT / f"{tid}.webp")
                have[tid] = y
                got += 1
            except Exception as e:
                print(f"  falha {y}-{uf}-{sq}: {e}")
        print(f"{y} {uf}: {got}/{len(sqs)}")


def candidates_csv(year):
    name = "cand_2026.zip" if year == 2026 and not (ZIPS / "consulta_cand_2026.zip").exists() else f"consulta_cand_{year}.zip"
    z = ZIPS / name
    if not z.exists():
        return
    lst = subprocess.run(["unzip", "-Z1", str(z)], capture_output=True, text=True).stdout.split()
    target = next((f for f in lst if f.upper().endswith("_BRASIL.CSV")), None)
    files = [target] if target else [f for f in lst if f.lower().endswith(".csv")]
    for f in files:
        p = subprocess.Popen(["unzip", "-p", str(z), f], stdout=subprocess.PIPE)
        reader = csv.reader(io.TextIOWrapper(p.stdout, encoding="latin1"), delimiter=";")
        header = None
        for row in reader:
            if row and row[0] == "DT_GERACAO":
                header = {h: i for i, h in enumerate(row)}
                continue
            if header:
                yield {k: row[i] if i < len(row) else "" for k, i in header.items()}
        p.wait()


def keys_of(r):
    out = []
    full = norm(r.get("NM_CANDIDATO"))
    dt = r.get("DT_NASCIMENTO", "")
    if full and re.match(r"\d{2}/\d{2}/\d{4}$", dt):
        out.append(f"n:{full}|{dt}")
    cpf = r.get("NR_CPF_CANDIDATO", "")
    if re.match(r"^\d{11}$", cpf):
        out.append(f"c:{cpf}")
    return out


def fetch_cross_year(ids, have):
    """Para quem não tem foto no próprio ano: procura a mesma pessoa em eleições seguintes."""
    missing = defaultdict(dict)
    for tid, (y, uf, sq) in ids.items():
        if tid not in have:
            missing[y][sq] = tid
    if not missing:
        return
    # identidade (nome completo + nascimento, CPF) de cada registro sem foto
    want = {}
    for y, regs in sorted(missing.items()):
        for r in candidates_csv(y):
            tid = regs.get(r.get("SQ_CANDIDATO"))
            if tid:
                for k in keys_of(r):
                    want.setdefault(k, set()).add((tid, y))
        print(f"identidades de {y}: {sum(1 for v in want.values() for t in v if t[1] == y)}")
    # procura nas eleições seguintes, da mais próxima para a mais distante
    found = {}
    for later in [2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026]:
        pending = {t for v in want.values() for t in v if t[0] not in found and t[1] < later}
        if not pending:
            continue
        for r in candidates_csv(later):
            for k in keys_of(r):
                for tid, y in want.get(k, ()):
                    if tid not in found and y < later:
                        uf = "BR" if r.get("SG_UE") == "BR" or r.get("DS_CARGO", "").upper() in ("PRESIDENTE", "VICE-PRESIDENTE") else r.get("SG_UF")
                        sq = r["SQ_CANDIDATO"] if later > 2004 else f"{int(r['SG_UE'] or 0)}_{int(r['SQ_CANDIDATO'] or 0)}"
                        found[tid] = (later, uf, sq)
        print(f"busca em {later}: {len(found)} encontrados")
    groups = defaultdict(list)
    for tid, (y, uf, sq) in found.items():
        groups[(y, uf)].append((tid, sq))
    for (y, uf), items in sorted(groups.items()):
        try:
            zf = zipfile.ZipFile(HttpFile(photo_url(y, uf)))
        except Exception as e:
            print(f"  sem zip {y} {uf}: {e}")
            continue
        names = photo_index(zf)
        for tid, sq in items:
            n = names.get(sq)
            if n:
                save_photo(zf.read(n), OUT / f"{tid}.webp")
                have[tid] = y
        print(f"outro ano {y} {uf}: {sum(1 for t, _ in items if t in have)}/{len(items)}")


def main():
    have = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    have = {k: v for k, v in have.items() if (OUT / f"{k}.webp").exists()}
    ids = needed_ids()
    print(f"pessoas com cargo: {len(ids)}, já com foto: {len(have)}")
    fetch_direct(ids, have)
    MANIFEST.write_text(json.dumps(dict(sorted(have.items())), separators=(",", ":")))
    fetch_cross_year(ids, have)
    MANIFEST.write_text(json.dumps(dict(sorted(have.items())), separators=(",", ":")))
    total = sum(f.stat().st_size for f in OUT.glob("*.webp"))
    print(f"fotos: {len(have)}/{len(ids)} ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
