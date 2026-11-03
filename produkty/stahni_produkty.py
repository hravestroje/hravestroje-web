#!/usr/bin/env python3
"""
Stáhne XML export produktů ze Shoptetu (marketingový export productsMarketing.xml,
umí i starší formát) a vytvoří z něj produkty.json
pro skript hs-darky.js (doporučené produkty v článcích).

Použití:
  # adresa exportu se bere z proměnné prostředí SHOPTET_FEED_URL (GitHub secret)
  python3 produkty/stahni_produkty.py --vystup _site/produkty/produkty.json

  # nebo z místního souboru (testování)
  python3 produkty/stahni_produkty.py --soubor produkty/ukazka-export.xml --vystup /tmp/produkty.json

Jen standardní knihovna Pythonu, nic se neinstaluje.
Skript nikdy nevypisuje adresu exportu (obsahuje tajný klíč).
"""

import argparse
import datetime as dt
import gzip
import json
import os
import re
import shutil
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

ADRESAR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- pomocné funkce

def bez_diakritiky(text):
    """'Vláček Mašinka' -> 'vlacek masinka' (malá písmena, bez háčků a čárek)."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(z for z in text if not unicodedata.combining(z))
    return re.sub(r"\s+", " ", text.lower()).strip()


def cislo(text):
    """'1 299,00' -> 1299.0, prázdné/nesmysl -> None."""
    if text is None:
        return None
    text = text.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def zaokrouhli(cena):
    if cena is None:
        return None
    return int(cena) if float(cena).is_integer() else round(cena, 2)


def txt(el, *cesty):
    """Vrátí text prvního nalezeného potomka z cest (např. 'NAME', 'STOCK/AMOUNT')."""
    for cesta in cesty:
        nalez = el.find(cesta)
        if nalez is not None and nalez.text and nalez.text.strip():
            return nalez.text.strip()
    return None


def datum(text):
    try:
        return dt.date.fromisoformat((text or "")[:10])
    except ValueError:
        return None


# ---------------------------------------------------------------- stažení

def stahni(url, cil):
    """Stáhne export do souboru. Při chybě to 3× zkusí znovu. Adresu nevypisuje."""
    posledni = None
    for pokus in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "hravestroje-darky/1.0"})
            with urllib.request.urlopen(req, timeout=180) as odpoved, open(cil, "wb") as f:
                shutil.copyfileobj(odpoved, f)
            return
        except urllib.error.HTTPError as e:
            posledni = f"HTTP {e.code}"
        except Exception as e:  # noqa: BLE001 – chceme jen stručnou hlášku bez URL
            posledni = type(e).__name__
        print(f"Stažení se nepovedlo (pokus {pokus}/3): {posledni}", file=sys.stderr)
        time.sleep(5 * pokus)
    raise SystemExit(f"CHYBA: export produktů se nepodařilo stáhnout ({posledni}).")


def otevri(cesta):
    """Otevře XML, i když je zabalené gzipem."""
    with open(cesta, "rb") as f:
        hlavicka = f.read(2)
    return gzip.open(cesta, "rb") if hlavicka == b"\x1f\x8b" else open(cesta, "rb")


# ---------------------------------------------------------------- témata

class Temata:
    def __init__(self, pravidla):
        self.temata = []
        for nazev, nastaveni in (pravidla.get("temata") or {}).items():
            slova = [bez_diakritiky(s) for s in nastaveni.get("slova", []) if s.strip()]
            vyjimky = [bez_diakritiky(s) for s in nastaveni.get("vyjimky", []) if s.strip()]
            self.temata.append((nazev, self._regex(slova), self._regex(vyjimky)))

    @staticmethod
    def _regex(slova):
        if not slova:
            return None
        # slovo musí začínat na začátku slova v textu ('vlac' najde 'vlacek', ne 'provlacet')
        return re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(s) for s in slova) + ")")

    def pro(self, text):
        text = bez_diakritiky(text)
        vysledek = []
        for nazev, slova, vyjimky in self.temata:
            if not slova:
                continue
            # výjimky nejdřív z textu vystřihneme celé slovo, pak hledáme téma
            t = text
            if vyjimky:
                t = re.sub(vyjimky.pattern + r"[a-z0-9]*", " ", t)
            if slova.search(t):
                vysledek.append(nazev)
        return vysledek


# ---------------------------------------------------------------- čtení exportu

VIDITELNE = ("visible", "1", "true", "yes")


def je_viditelna(el):
    """Produkt/varianta je viditelná, pokud ji export neoznačí jako skrytou.
    Produkt: <VISIBILITY>visible</VISIBILITY>, varianta: <VISIBLE>1</VISIBLE> (marketingový export)."""
    for znacka in ("VISIBILITY", "VISIBLE"):
        hodnota = txt(el, znacka)
        if hodnota is not None and hodnota.lower() not in VIDITELNE:
            return False
    return True


def je_skladem(mnozstvi, bez_poctu_je_skladem):
    if mnozstvi is None:
        return bez_poctu_je_skladem
    return mnozstvi > 0


def cena_polozky(el, dnes):
    """(cena, puvodni_cena) – zohlední akční cenu, pokud právě platí.
    Cena s DPH je v <PRICE_VAT> (starší export) nebo v <PRICE> (marketingový export)."""
    cena = cislo(txt(el, "PRICE_VAT", "PRICE"))
    akce = cislo(txt(el, "ACTION_PRICE", "ACTION_PRICE_VAT"))
    od, do = datum(txt(el, "ACTION_PRICE_FROM")), datum(txt(el, "ACTION_PRICE_UNTIL"))
    if akce and cena and akce < cena and (not od or od <= dnes) and (not do or dnes <= do):
        return akce, cena
    bezna = cislo(txt(el, "STANDARD_PRICE"))
    if cena and bezna and bezna > cena:
        return cena, bezna
    return cena, None


def zpracuj_polozku(el, pravidla, temata, dnes):
    """Z jednoho <SHOPITEM> udělá slovník pro produkty.json, nebo None."""
    if not je_viditelna(el):
        return None  # skryté a blokované produkty vynecháme

    nazev = txt(el, "NAME", "PRODUCTNAME", "PRODUCT")
    # marketingový export má odkaz v <ORIG_URL>, starší exporty v <URL>
    url = txt(el, "ORIG_URL", "URL")
    if not nazev or not url or not url.startswith(("https://", "http://")):
        return None

    obrazek = txt(el, "IMAGES/IMAGE", "IMGURL", "IMAGE")

    kategorie = []
    for cesta in ("CATEGORIES/DEFAULT_CATEGORY", "CATEGORIES/CATEGORY", "CATEGORYTEXT"):
        for k in el.findall(cesta):
            if k.text and k.text.strip() and k.text.strip() not in kategorie:
                kategorie.append(k.text.strip())

    bez_poctu = bool(pravidla.get("sklad_bez_poctu_je_skladem", True))
    cena, puvodni = cena_polozky(el, dnes)

    varianty = el.findall("VARIANTS/VARIANT")
    if varianty:
        # produkt je skladem, když je skladem aspoň jedna viditelná varianta;
        # cena = nejnižší cena ze skladových variant („od 549 Kč“), jinak ze všech viditelných
        skladem = False
        ceny_skladem, ceny_vse = [], []
        obrazek_varianty = None
        for v in varianty:
            if not je_viditelna(v):
                continue
            v_cena, v_puvodni = cena_polozky(v, dnes)
            v_skladem = je_skladem(cislo(txt(v, "STOCK/AMOUNT")), bez_poctu)
            if v_cena:
                ceny_vse.append((v_cena, v_puvodni))
                if v_skladem:
                    ceny_skladem.append((v_cena, v_puvodni))
            skladem = skladem or v_skladem
            obrazek_varianty = obrazek_varianty or txt(v, "IMAGE_REF", "IMAGE")
        vyber = ceny_skladem or ceny_vse
        if vyber:
            cena, puvodni = min(vyber, key=lambda c: c[0])
        obrazek = obrazek or obrazek_varianty
    else:
        mnozstvi = cislo(txt(el, "STOCK/AMOUNT"))
        if mnozstvi is None and txt(el, "DELIVERY_DATE") is not None:
            # formát Heureka/Zboží: DELIVERY_DATE 0 = skladem
            skladem = txt(el, "DELIVERY_DATE") == "0"
        else:
            skladem = je_skladem(mnozstvi, bez_poctu)

    if cena is None or cena <= 0:
        return None

    produkt = {
        "nazev": nazev,
        "cena": zaokrouhli(cena),
        "url": url,
        "obrazek": obrazek if obrazek and obrazek.startswith(("https://", "http://")) else None,
        "kategorie": kategorie,
        "skladem": skladem,
        "temata": temata.pro(nazev + " | " + " | ".join(kategorie)),
    }
    if puvodni:
        produkt["puvodni_cena"] = zaokrouhli(puvodni)
    return produkt


# Do veřejného produkty.json smí jen tyto údaje (vše je stejně vidět na e-shopu).
# Nákupní ceny, počty kusů, kódy, dodavatelé ani nic dalšího z exportu se nezveřejňuje.
VEREJNE_KLICE = ("nazev", "cena", "puvodni_cena", "url", "obrazek", "kategorie", "skladem", "temata")


def jen_verejne(produkt):
    return {k: produkt[k] for k in VEREJNE_KLICE if k in produkt}


def nacti_export(cesta, pravidla):
    temata = Temata(pravidla)
    dnes = dt.date.today()
    produkty, videne_url, mena, polozek = [], set(), None, 0
    with otevri(cesta) as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != "SHOPITEM":
                continue
            polozek += 1
            mena = mena or txt(el, "CURRENCY")
            p = zpracuj_polozku(el, pravidla, temata, dnes)
            if p and p["url"] not in videne_url:  # varianty v Heureka formátu mají stejnou URL
                videne_url.add(p["url"])
                produkty.append(p)
            el.clear()  # šetříme paměť u velkých exportů
    return produkty, mena or "CZK", polozek


# ---------------------------------------------------------------- hlavní program

def main():
    ap = argparse.ArgumentParser(description="Shoptet XML export -> produkty.json")
    ap.add_argument("--soubor", help="místní XML soubor místo stahování (pro testy)")
    ap.add_argument("--vystup", required=True, help="kam uložit produkty.json")
    ap.add_argument("--pravidla", default=os.path.join(ADRESAR, "pravidla.json"))
    ap.add_argument("--js", help="navíc uložit data jako JS soubor (pro demo.html)")
    ap.add_argument("--min-produktu", type=int, default=1,
                    help="když jich bude méně, skončí chybou a stará data zůstanou zveřejněná")
    args = ap.parse_args()

    with open(args.pravidla, encoding="utf-8") as f:
        pravidla = json.load(f)

    with tempfile.TemporaryDirectory() as tmp:
        if args.soubor:
            xml = args.soubor
        else:
            url = os.environ.get("SHOPTET_FEED_URL", "").strip()
            if not url:
                raise SystemExit("CHYBA: chybí secret SHOPTET_FEED_URL s adresou XML exportu ze Shoptetu. "
                                 "Nastavte ho v Settings → Secrets and variables → Actions. "
                                 "Nic se nezveřejnilo.")
            xml = os.path.join(tmp, "export.xml")
            stahni(url, xml)
        try:
            produkty, mena, polozek = nacti_export(xml, pravidla)
        except ET.ParseError as e:
            raise SystemExit(f"CHYBA: stažený soubor není platné XML ({e}).")

    if len(produkty) < args.min_produktu:
        raise SystemExit(f"CHYBA: v exportu je jen {len(produkty)} použitelných produktů "
                         f"(položek SHOPITEM: {polozek}, potřeba aspoň {args.min_produktu}) – "
                         "zkontrolujte, že jde o XML export produktů Shoptetu (marketingový export "
                         "productsMarketing.xml) a že produkty mají název, odkaz (ORIG_URL/URL) a cenu "
                         "(PRICE/PRICE_VAT). Nic se nezveřejnilo.")

    data = {
        "vygenerovano": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mena": mena,
        "sezony": [{"tema": s["tema"], "mesice": s["mesice"]} for s in pravidla.get("sezony", [])],
        "produkty": [jen_verejne(p) for p in produkty],
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.vystup)), exist_ok=True)
    with open(args.vystup, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    if args.js:
        with open(args.js, "w", encoding="utf-8") as f:
            f.write("// Vygenerováno skriptem stahni_produkty.py z ukazka-export.xml\n")
            f.write("window.HS_DARKY_DATA = ")
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write(";\n")

    # souhrn do logu (bez adresy exportu)
    skladem = sum(p["skladem"] for p in produkty)
    print(f"Produktů celkem: {len(produkty)}, skladem: {skladem}")
    for nazev in (pravidla.get("temata") or {}):
        n = sum(1 for p in produkty if p["skladem"] and nazev in p["temata"])
        print(f"  téma {nazev}: {n} skladem")
    print(f"Uloženo: {args.vystup} ({os.path.getsize(args.vystup) // 1024} kB)")


if __name__ == "__main__":
    main()
