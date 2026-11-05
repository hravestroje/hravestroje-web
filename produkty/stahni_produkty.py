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


# ---------------------------------------------------------------- obrázky

def je_adresa(text):
    return bool(text) and text.startswith(("https://", "http://"))


def pridej_obrazek(seznam, adresa):
    adresa = (adresa or "").strip()
    if je_adresa(adresa) and adresa not in seznam:
        seznam.append(adresa)


def obrazky_polozky(el):
    """Všechny obrázky produktu: <IMAGES><IMAGE>… (marketingový export), jinak starší
    <IMGURL> + <IMGURL_ALTERNATIVE> (Heureka) nebo <IMAGE>. Bez duplicit, jen http(s)."""
    obrazky = []
    for cesta in ("IMAGES/IMAGE", "IMGURL", "IMGURL_ALTERNATIVE", "IMAGE"):
        for o in el.findall(cesta):
            pridej_obrazek(obrazky, o.text)
    return obrazky


# ---------------------------------------------------------------- obrázky ze stránky produktu
# Export Shoptetu dává jen 3–4 obrázky, ale produkt jich v e-shopu může mít až 17.
# Když jich je v exportu málo, stáhneme veřejnou stránku produktu a vezmeme obrázky z její galerie.

MIN_OBRAZKU_Z_EXPORTU = 6   # když jich má produkt v exportu méně, doplní se ze stránky
MAX_OBRAZKU = 8             # nejvýš tolik obrázků na produkt
LIMIT_STRANKY = 10          # s – časový limit na stažení jedné stránky
PAUZA_MEZI_STRANKAMI = 0.5  # s – ať e-shop nezatěžujeme

_PRODUCT_ID = (
    re.compile(r'name=["\']productId["\'][^>]*?value=["\'](\d+)', re.I),
    re.compile(r'value=["\'](\d+)["\'][^>]*?name=["\']productId["\']', re.I),
    re.compile(r'["\']productId["\']\s*:\s*["\']?(\d+)', re.I),
    re.compile(r'data-micro-product-id=["\'](\d+)', re.I),
)
# Obrázek z galerie Shoptetu v libovolné velikosti (orig, big, detail, related…):
# //cdn.myshoptet.com/usr/<obchod>/user/shop/<velikost>/<soubor>?<parametry>
_OBRAZEK_SHOPTET = re.compile(
    r'(?:https?:)?//cdn\.myshoptet\.com/usr/([A-Za-z0-9.-]+)/user/shop/[A-Za-z0-9_]+/([^"\'\s?#<>()\\]+)')


def product_id(html):
    """productId ze stránky produktu Shoptetu (skryté pole formuláře, dataLayer…), jinak None."""
    for r in _PRODUCT_ID:
        m = r.search(html)
        if m:
            return m.group(1)
    return None


def obrazky_ze_stranky(html):
    """Obrázky z galerie stránky produktu v pořadí e-shopu: jen soubory <ID>_… a <ID>-<n>_…
    (ID = productId stránky, ne obrázky souvisejících produktů), verze „orig“ bez ?parametrů,
    bez duplicit, nejvýš MAX_OBRAZKU."""
    pid = product_id(html)
    if not pid:
        return []
    vlastni = re.compile(r"^" + re.escape(pid) + r"(?:-\d+)?_", re.I)
    obrazky = []
    for m in _OBRAZEK_SHOPTET.finditer(html.replace("\\/", "/")):
        obchod, soubor = m.group(1), m.group(2)
        if not vlastni.match(soubor):
            continue
        pridej_obrazek(obrazky, f"https://cdn.myshoptet.com/usr/{obchod}/user/shop/orig/{soubor}")
        if len(obrazky) >= MAX_OBRAZKU:
            break
    return obrazky


def bez_parametru(url):
    return re.split(r"[?#]", url or "")[0]


def sluc_obrazky(z_exportu, ze_stranky):
    """Pořadí galerie e-shopu; obrázky z exportu, které na stránce nejsou, na konec. Max MAX_OBRAZKU."""
    vysledek, videne = [], set()
    for o in list(ze_stranky) + list(z_exportu):
        klic = bez_parametru(o).lower()
        klic = re.sub(r"/user/shop/[A-Za-z0-9_]+/", "/user/shop/orig/", klic)
        if klic in videne:
            continue
        videne.add(klic)
        vysledek.append(o)
    return vysledek[:MAX_OBRAZKU]


def stahni_stranku(url):
    req = urllib.request.Request(url, headers={"User-Agent": "hravestroje-darky/1.0"})
    with urllib.request.urlopen(req, timeout=LIMIT_STRANKY) as odpoved:
        data = odpoved.read(3_000_000)
        kodovani = odpoved.headers.get_content_charset() or "utf-8"
    return data.decode(kodovani, errors="replace")


def nazev_ulozene_stranky(url):
    """Pro testy: https://www.hravestroje.cz/adventni-kalendar/ -> adventni-kalendar.html"""
    return (normalizuj_url(url).strip("/").replace("/", "_") or "index") + ".html"


def dopln_obrazky_ze_stranek(produkty, slozka=None, pauza=PAUZA_MEZI_STRANKAMI):
    """Produktům s méně než MIN_OBRAZKU_Z_EXPORTU obrázky doplní obrázky z galerie stránky produktu.
    slozka = místo stahování číst uložené stránky (testy bez sítě). Chyba nikdy neshodí běh –
    produkt si nechá obrázky z exportu a vypíše se UPOZORNĚNÍ. Vrací počet doplněných produktů."""
    doplneno, stazeno = 0, 0
    for p in produkty:
        if len(p["obrazky"]) >= MIN_OBRAZKU_Z_EXPORTU or not p["url"].startswith("https://"):
            continue
        try:
            if slozka:
                with open(os.path.join(slozka, nazev_ulozene_stranky(p["url"])), encoding="utf-8") as f:
                    html = f.read()
            else:
                if stazeno:
                    time.sleep(pauza)
                stazeno += 1
                html = stahni_stranku(p["url"])
            ze_stranky = obrazky_ze_stranky(html)
        except Exception as e:  # noqa: BLE001 – stránka nesmí shodit zveřejnění produktů
            duvod = f"HTTP {e.code}" if isinstance(e, urllib.error.HTTPError) else type(e).__name__
            print(f"UPOZORNĚNÍ: obrázky ze stránky produktu „{p['nazev']}“ se nepodařilo načíst "
                  f"({duvod}) – nechávám {len(p['obrazky'])} obrázků z exportu.", file=sys.stderr)
            continue
        if not ze_stranky:
            print(f"UPOZORNĚNÍ: na stránce produktu „{p['nazev']}“ není galerie obrázků – "
                  f"nechávám {len(p['obrazky'])} obrázků z exportu.", file=sys.stderr)
            continue
        nove = sluc_obrazky(p["obrazky"], ze_stranky)
        if len(nove) > len(p["obrazky"]):
            doplneno += 1
        if nove != p["obrazky"]:
            p["obrazky"] = nove
            p["obrazek"] = nove[0]
    return doplneno


# ---------------------------------------------------------------- ruční náhledy (nahledy.json)

def normalizuj_url(url):
    """'https://www.hravestroje.cz/produkt-1/?x' -> '/produkt-1' (bez domény, parametrů a lomítka na konci)."""
    url = re.sub(r"^https?://[^/]+", "", (url or "").strip())
    url = re.split(r"[?#]", url)[0]
    return url.rstrip("/").lower() or "/"


def nacti_nahledy(cesta):
    """{klíč: nastavení}, klíč = kód produktu (velkými písmeny) nebo normalizovaná URL."""
    if not cesta or not os.path.exists(cesta):
        return {}
    with open(cesta, encoding="utf-8") as f:
        data = json.load(f)
    vysledek = {}
    for klic, nastaveni in (data.get("produkty") or {}).items():
        if klic.startswith("_") or not isinstance(nastaveni, dict):
            continue  # "_priklad…" a poznámky přeskočíme
        klic = klic.strip()
        if klic.startswith(("https://", "http://", "/")):
            vysledek["url:" + normalizuj_url(klic)] = (klic, nastaveni)
        else:
            vysledek["kod:" + klic.upper()] = (klic, nastaveni)
    return vysledek


def vyber_obrazek(hodnota, obrazky, co, kdo):
    """Hodnota z nahledy.json: pořadí obrázku (1 = první) nebo celá adresa obrázku."""
    if hodnota is None or hodnota == "":
        return None
    if isinstance(hodnota, str) and hodnota.strip().isdigit():
        hodnota = int(hodnota.strip())
    if isinstance(hodnota, int) and not isinstance(hodnota, bool):
        if 1 <= hodnota <= len(obrazky):
            return obrazky[hodnota - 1]
        print(f"UPOZORNĚNÍ nahledy.json: {kdo} – \"{co}\": {hodnota}, ale produkt má jen "
              f"{len(obrazky)} obrázků. Ignoruji.", file=sys.stderr)
        return None
    if isinstance(hodnota, str) and je_adresa(hodnota.strip()):
        return hodnota.strip()
    print(f"UPOZORNĚNÍ nahledy.json: {kdo} – \"{co}\" má být číslo obrázku (1, 2, …) "
          f"nebo adresa https://…, je {hodnota!r}. Ignoruji.", file=sys.stderr)
    return None


def pouzij_nahledy(produkty, nahledy):
    """Podle nahledy.json přeřadí obrázky: [hlavní, náhled, ostatní…] a označí produkt "nahled": true."""
    pouzite = set()
    for p in produkty:
        for klic in ("kod:" + (p.get("_kod") or "").upper(), "url:" + normalizuj_url(p["url"])):
            if klic in nahledy and klic != "kod:":
                break
        else:
            continue
        pouzite.add(klic)
        kdo, nastaveni = nahledy[klic]
        puvodni = list(p["obrazky"])
        hlavni = vyber_obrazek(nastaveni.get("hlavni"), puvodni, "hlavni", kdo)
        nahled = vyber_obrazek(nastaveni.get("nahled"), puvodni, "nahled", kdo)
        poradi = []
        for o in (hlavni or (puvodni[0] if puvodni else None), nahled):
            pridej_obrazek(poradi, o)
        for o in puvodni:
            pridej_obrazek(poradi, o)
        p["obrazky"] = poradi
        p["obrazek"] = poradi[0] if poradi else None
        if nahled and nahled != poradi[0] and nastaveni.get("stitek", True) is not False:
            p["nahled"] = True  # štítek „Ukázka obsahu uvnitř“
    for klic, (kdo, _) in nahledy.items():
        if klic not in pouzite:
            print(f"UPOZORNĚNÍ nahledy.json: produkt \"{kdo}\" v exportu není (nebo není viditelný).",
                  file=sys.stderr)
    return len(pouzite)


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

    # všechny obrázky produktu v pořadí z e-shopu (první = obálka)
    obrazky = obrazky_polozky(el)

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
        obrazky_variant = []
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
            pridej_obrazek(obrazky_variant, txt(v, "IMAGE_REF", "IMAGE"))
        vyber = ceny_skladem or ceny_vse
        if vyber:
            cena, puvodni = min(vyber, key=lambda c: c[0])
        if not obrazky:  # produkt bez vlastních obrázků → obrázky viditelných variant
            obrazky = obrazky_variant
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
        "obrazek": obrazky[0] if obrazky else None,  # zpětná kompatibilita (starší hs-darky.js)
        "obrazky": obrazky,
        "kategorie": kategorie,
        "skladem": skladem,
        "temata": temata.pro(nazev + " | " + " | ".join(kategorie)),
    }
    if puvodni:
        produkt["puvodni_cena"] = zaokrouhli(puvodni)
    produkt["_kod"] = txt(el, "CODE")  # jen pro nahledy.json, do produkty.json se nedostane
    return produkt


# Do veřejného produkty.json smí jen tyto údaje (vše je stejně vidět na e-shopu).
# Nákupní ceny, počty kusů, kódy, dodavatelé ani nic dalšího z exportu se nezveřejňuje.
VEREJNE_KLICE = ("nazev", "cena", "puvodni_cena", "url", "obrazek", "obrazky", "nahled",
                 "kategorie", "skladem", "temata")


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
    ap.add_argument("--nahledy", default=os.path.join(ADRESAR, "nahledy.json"),
                    help="ruční výběr hlavního obrázku a náhledu obsahu (nepovinné)")
    ap.add_argument("--js", help="navíc uložit data jako JS soubor (pro demo.html)")
    ap.add_argument("--galerie", choices=("auto", "ano", "ne"), default="auto",
                    help="doplnit obrázky z galerie stránky produktu (auto = jen při stahování exportu, "
                         "ne u --soubor)")
    ap.add_argument("--stranky", help="složka s uloženými stránkami produktů místo stahování (pro testy)")
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

    # obrázky z galerie stránky produktu (před nahledy.json – ruční výběr má dál přednost)
    galerie = args.galerie == "ano" or bool(args.stranky) or (args.galerie == "auto" and not args.soubor)
    doplneno = dopln_obrazky_ze_stranek(produkty, args.stranky) if galerie else 0

    try:
        nahledy = nacti_nahledy(args.nahledy)
    except (ValueError, OSError) as e:
        # chyba v ručně psaném souboru nesmí shodit zveřejnění produktů
        print(f"UPOZORNĚNÍ: nahledy.json nejde přečíst ({e}) – ruční náhledy se teď nepoužijí. "
              "Zkontrolujte čárky a uvozovky.", file=sys.stderr)
        nahledy = {}
    pouzito_nahledu = pouzij_nahledy(produkty, nahledy)

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
    vice = sum(1 for p in produkty if len(p["obrazky"]) > 1)
    print(f"Produktů s více obrázky: {vice}, ruční náhledy z nahledy.json: {pouzito_nahledu}")
    if galerie:
        print(f"Obrázky doplněné z galerie stránky produktu: {doplneno} produktů")
    print(f"Uloženo: {args.vystup} ({os.path.getsize(args.vystup) // 1024} kB)")


if __name__ == "__main__":
    main()
