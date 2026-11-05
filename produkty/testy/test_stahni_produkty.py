#!/usr/bin/env python3
"""Testy obrázků a ručních náhledů ve stahni_produkty.py (jen standardní knihovna).
   python3 produkty/testy/test_stahni_produkty.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

ADRESAR = os.path.dirname(os.path.abspath(__file__))
PRODUKTY = os.path.dirname(ADRESAR)
SKRIPT = os.path.join(PRODUKTY, "stahni_produkty.py")


def spust(xml, nahledy=None, soubor_nahledu=None, navic=()):
    with tempfile.TemporaryDirectory() as tmp:
        cesta_xml = os.path.join(tmp, "export.xml")
        with open(cesta_xml, "w", encoding="utf-8") as f:
            f.write(xml)
        vystup = os.path.join(tmp, "p.json")
        prikaz = [sys.executable, SKRIPT, "--soubor", cesta_xml, "--vystup", vystup]
        if nahledy is not None:
            soubor_nahledu = os.path.join(tmp, "nahledy.json")
            with open(soubor_nahledu, "w", encoding="utf-8") as f:
                f.write(nahledy if isinstance(nahledy, str) else json.dumps(nahledy))
        prikaz += ["--nahledy", soubor_nahledu or os.path.join(tmp, "neexistuje.json")] + list(navic)
        beh = subprocess.run(prikaz, capture_output=True, text=True)
        assert beh.returncode == 0, beh.stderr
        with open(vystup, encoding="utf-8") as f:
            data = json.load(f)
        return {p["url"].rstrip("/").rsplit("/", 1)[-1]: p for p in data["produkty"]}, beh.stderr


def polozka(id_, obrazky, kod=None):
    imgs = "".join(f"<IMAGE>{o}</IMAGE>" for o in obrazky)
    return (f"<SHOPITEM id='{id_}'><NAME>Produkt {id_}</NAME><VISIBILITY>visible</VISIBILITY>"
            f"<ORIG_URL>https://www.hravestroje.cz/p-{id_}/</ORIG_URL>"
            f"{'<IMAGES>' + imgs + '</IMAGES>' if obrazky else ''}"
            f"<CODE>{kod or 'K' + str(id_)}</CODE><PRICE>100</PRICE><STOCK><AMOUNT>1</AMOUNT></STOCK></SHOPITEM>")


A, B, C = "https://cdn.example/a.jpg", "https://cdn.example/b.jpg", "https://cdn.example/c.jpg"
XML = ("<SHOP>" + polozka(1, [A, B, C]) + polozka(2, [A]) + polozka(3, []) +
       polozka(4, [A, "relativni/x.jpg", A, B]) + polozka(5, [A, B, C], kod="HS-5") + "</SHOP>")


class Obrazky(unittest.TestCase):
    def test_vice_obrazku(self):
        p, _ = spust(XML)
        self.assertEqual(p["p-1"]["obrazky"], [A, B, C])
        self.assertEqual(p["p-1"]["obrazek"], A, "obrazek = první (zpětná kompatibilita)")
        self.assertNotIn("nahled", p["p-1"])

    def test_jeden_obrazek(self):
        p, _ = spust(XML)
        self.assertEqual(p["p-2"]["obrazky"], [A])
        self.assertEqual(p["p-2"]["obrazek"], A)

    def test_bez_obrazku(self):
        p, _ = spust(XML)
        self.assertEqual(p["p-3"]["obrazky"], [])
        self.assertIsNone(p["p-3"]["obrazek"])

    def test_duplicity_a_relativni_adresy(self):
        p, _ = spust(XML)
        self.assertEqual(p["p-4"]["obrazky"], [A, B])

    def test_kod_neni_verejny(self):
        p, _ = spust(XML)
        self.assertFalse(any(k.startswith("_") for x in p.values() for k in x))
        self.assertNotIn("HS-5", json.dumps(p))

    def test_heureka_imgurl_alternative(self):
        xml = ("<SHOP><SHOPITEM><PRODUCTNAME>H</PRODUCTNAME><URL>https://e.cz/h/</URL><PRICE_VAT>10</PRICE_VAT>"
               f"<IMGURL>{A}</IMGURL><IMGURL_ALTERNATIVE>{B}</IMGURL_ALTERNATIVE>"
               f"<IMGURL_ALTERNATIVE>{C}</IMGURL_ALTERNATIVE><DELIVERY_DATE>0</DELIVERY_DATE></SHOPITEM></SHOP>")
        p, _ = spust(xml)
        self.assertEqual(p["h"]["obrazky"], [A, B, C])


class RucniNahled(unittest.TestCase):
    def test_podle_kodu_poradim(self):
        p, _ = spust(XML, {"produkty": {"hs-5": {"nahled": 3}}})
        self.assertEqual(p["p-5"]["obrazky"], [A, C, B])
        self.assertTrue(p["p-5"]["nahled"])

    def test_podle_url_hlavni_i_nahled(self):
        p, _ = spust(XML, {"produkty": {"https://www.hravestroje.cz/p-1": {"hlavni": 2, "nahled": "3"}}})
        self.assertEqual(p["p-1"]["obrazky"], [B, C, A])
        self.assertEqual(p["p-1"]["obrazek"], B, "obrazek odpovídá ručně zvolenému hlavnímu")
        self.assertTrue(p["p-1"]["nahled"])

    def test_url_bez_domeny(self):
        p, _ = spust(XML, {"produkty": {"/p-1/": {"nahled": 2}}})
        self.assertEqual(p["p-1"]["obrazky"], [A, B, C])
        self.assertTrue(p["p-1"]["nahled"])

    def test_vlastni_adresa_obrazku(self):
        D = "https://cdn.example/obsah.jpg"
        p, _ = spust(XML, {"produkty": {"K2": {"nahled": D}}})
        self.assertEqual(p["p-2"]["obrazky"], [A, D])
        self.assertTrue(p["p-2"]["nahled"])

    def test_jen_hlavni_bez_stitku(self):
        p, _ = spust(XML, {"produkty": {"K1": {"hlavni": 3}}})
        self.assertEqual(p["p-1"]["obrazky"], [C, A, B])
        self.assertNotIn("nahled", p["p-1"])

    def test_stitek_vypnuty(self):
        p, _ = spust(XML, {"produkty": {"K1": {"nahled": 2, "stitek": False}}})
        self.assertNotIn("nahled", p["p-1"])

    def test_chybne_cislo_a_neznamy_produkt(self):
        p, chyby = spust(XML, {"produkty": {"K2": {"nahled": 4}, "NEEXISTUJE": {"nahled": 2},
                                            "_priklad": {"nahled": 2}}})
        self.assertEqual(p["p-2"]["obrazky"], [A])
        self.assertNotIn("nahled", p["p-2"])
        self.assertIn("má jen 1 obrázků", chyby)
        self.assertIn("NEEXISTUJE", chyby)
        self.assertNotIn("_priklad", chyby)

    def test_rozbity_json_neshodi_beh(self):
        p, chyby = spust(XML, '{"produkty": {"K1": {"nahled": 2},}}')
        self.assertEqual(p["p-1"]["obrazky"], [A, B, C])
        self.assertIn("nahledy.json nejde přečíst", chyby)

    def test_vzorovy_nahledy_json_je_platny(self):
        # v nahledy.json je skutečný Adventní kalendář 3 v 1 → musí být i v testovacím exportu
        xml = XML.replace("</SHOP>", advent() + "</SHOP>")
        p, chyby = spust(xml, soubor_nahledu=os.path.join(PRODUKTY, "nahledy.json"))
        self.assertNotIn("UPOZORNĚNÍ", chyby)
        self.assertEqual([k for k, x in p.items() if "nahled" in x], ["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"])


# ---------------------------------------------------------------- obrázky z galerie stránky produktu
STRANKY = os.path.join(ADRESAR, "stranky")  # uložené stránky produktů (bez sítě)
CDN = "https://cdn.myshoptet.com/usr/www.hravestroje.cz/user/shop"
ADVENT_URL = "https://www.hravestroje.cz/adventni-kalendar-3v1-s-vlaky-traktory-a-auty/"


def advent(id_="advent", url=ADVENT_URL, obrazky=None):
    """Adventní kalendář 3 v 1, jak ho dává export: jen 3 obrázky (s ?parametry)."""
    if obrazky is None:
        obrazky = [f"{CDN}/orig/182_adventni-kalendar-3-v-1.jpg?66f1a2b0",
                   f"{CDN}/orig/182-1_adventni-kalendar-3-v-1---strana-1.jpg?66f1a2b1",
                   f"{CDN}/orig/182-2_adventni-kalendar-3-v-1---strana-2.jpg?66f1a2b2"]
    imgs = "".join(f"<IMAGE>{o.replace('&', '&amp;')}</IMAGE>" for o in obrazky)
    return (f"<SHOPITEM id='{id_}'><NAME>Adventní kalendář 3 v 1</NAME><VISIBILITY>visible</VISIBILITY>"
            f"<ORIG_URL>{url}</ORIG_URL><IMAGES>{imgs}</IMAGES>"
            "<CODE>HS182</CODE><PRICE>249</PRICE><STOCK><AMOUNT>3</AMOUNT></STOCK></SHOPITEM>")


def galerie(n):
    return [f"{CDN}/orig/182_adventni-kalendar-3-v-1.jpg"] + [
        f"{CDN}/orig/182-{i}_adventni-kalendar-3-v-1---strana-{i}.jpg" for i in range(1, n)]


class GalerieStranky(unittest.TestCase):
    def test_doplni_obrazky_v_poradi_eshopu(self):
        p, chyby = spust("<SHOP>" + advent() + "</SHOP>", navic=["--stranky", STRANKY])
        o = p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]["obrazky"]
        self.assertEqual(o, galerie(8), "8 obrázků z galerie, verze orig, bez ?parametrů")
        self.assertEqual(p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]["obrazek"], o[0])
        self.assertFalse(any("?" in x for x in o))
        self.assertFalse(any("/big/" in x or "/related/" in x for x in o))
        self.assertFalse(any("205_" in x or "18-2_" in x or "1820_" in x for x in o), "obrázky jiných produktů")
        self.assertNotIn("UPOZORNĚNÍ", chyby)

    def test_obrazek_z_exportu_mimo_galerii_zustane(self):
        navic = "https://cdn.example/jen-v-exportu.jpg"
        p, _ = spust("<SHOP>" + advent(obrazky=[navic]) + "</SHOP>", navic=["--stranky", STRANKY])
        o = p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]["obrazky"]
        self.assertEqual(len(o), 8)
        self.assertEqual(o, galerie(8), "galerie e-shopu má přednost, max 8")

    def test_dost_obrazku_v_exportu_stranka_se_necte(self):
        sest = [f"https://cdn.example/{i}.jpg" for i in range(6)]
        p, chyby = spust("<SHOP>" + advent(obrazky=sest) + "</SHOP>", navic=["--stranky", STRANKY])
        self.assertEqual(p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]["obrazky"], sest)
        self.assertNotIn("UPOZORNĚNÍ", chyby)

    def test_chybejici_stranka_neshodi_beh(self):
        p, chyby = spust(XML, navic=["--stranky", STRANKY])
        self.assertEqual(p["p-1"]["obrazky"], [A, B, C], "při chybě zůstanou obrázky z exportu")
        self.assertIn("UPOZORNĚNÍ", chyby)
        self.assertIn("nechávám 3 obrázků z exportu", chyby)

    def test_stranka_bez_galerie(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "p-1.html"), "w", encoding="utf-8") as f:
                f.write("<html><body>Údržba e-shopu</body></html>")
            p, chyby = spust(XML, navic=["--stranky", tmp])
        self.assertEqual(p["p-1"]["obrazky"], [A, B, C])
        self.assertIn("není galerie obrázků", chyby)

    def test_nahledy_json_ma_prednost(self):
        nahled = f"{CDN}/orig/182-4_adventni-kalendar-3-v-1---strana-4.jpg"
        p, _ = spust("<SHOP>" + advent() + "</SHOP>", {"produkty": {ADVENT_URL: {"hlavni": 3, "nahled": nahled}}},
                     navic=["--stranky", STRANKY])
        x = p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]
        g = galerie(8)
        self.assertEqual(x["obrazky"][:2], [g[2], nahled], "ruční hlavní (3. v e-shopu) a náhled")
        self.assertEqual(sorted(x["obrazky"]), sorted(g), "bez duplicit")
        self.assertEqual(x["obrazek"], g[2])
        self.assertTrue(x["nahled"])

    def test_u_mistniho_souboru_se_bez_prepinace_nestahuje(self):
        # --soubor bez --stranky/--galerie ano → žádná síť (testy i místní zkoušky jsou offline)
        p, chyby = spust("<SHOP>" + advent() + "</SHOP>")
        self.assertEqual(len(p["adventni-kalendar-3v1-s-vlaky-traktory-a-auty"]["obrazky"]), 3)
        self.assertNotIn("UPOZORNĚNÍ", chyby)

    def test_funkce_bez_spousteni(self):
        sys.dont_write_bytecode = True
        sys.path.insert(0, PRODUKTY)
        import stahni_produkty as s
        self.assertEqual(s.product_id('<input type="hidden" name="productId" value="77">'), "77")
        self.assertEqual(s.product_id('{"productId":"91"}'), "91")
        self.assertIsNone(s.product_id("<html></html>"))
        html = ('<input name="productId" value="5" type="hidden">'
                '<img src="//cdn.myshoptet.com/usr/obchod.cz/user/shop/detail/5-3_x.jpg?a=1">'
                '<a href="https://cdn.myshoptet.com/usr/obchod.cz/user/shop/big/5_x.jpg?b">'
                '<img src="https://cdn.myshoptet.com/usr/obchod.cz/user/shop/orig/5-3_x.jpg">'
                '<img src="https://cdn.myshoptet.com/usr/obchod.cz/user/shop/big/55_y.jpg">')
        self.assertEqual(s.obrazky_ze_stranky(html), [
            "https://cdn.myshoptet.com/usr/obchod.cz/user/shop/orig/5-3_x.jpg",
            "https://cdn.myshoptet.com/usr/obchod.cz/user/shop/orig/5_x.jpg"])
        # chyba stahování (síť) → UPOZORNĚNÍ, obrázky z exportu zůstanou, běh pokračuje
        produkty = [{"nazev": "X", "url": "https://www.hravestroje.cz/x/", "obrazky": [A], "obrazek": A}]
        puvodni = s.stahni_stranku
        try:
            def chyba(url):
                raise TimeoutError("timed out")
            s.stahni_stranku = chyba
            self.assertEqual(s.dopln_obrazky_ze_stranek(produkty, pauza=0), 0)
        finally:
            s.stahni_stranku = puvodni
        self.assertEqual(produkty[0]["obrazky"], [A])
        self.assertEqual(s.LIMIT_STRANKY, 10)
        self.assertEqual(s.PAUZA_MEZI_STRANKAMI, 0.5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
