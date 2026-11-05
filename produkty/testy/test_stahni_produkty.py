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


def spust(xml, nahledy=None, soubor_nahledu=None):
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
        prikaz += ["--nahledy", soubor_nahledu or os.path.join(tmp, "neexistuje.json")]
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
        p, chyby = spust(XML, soubor_nahledu=os.path.join(PRODUKTY, "nahledy.json"))
        self.assertNotIn("UPOZORNĚNÍ", chyby)
        self.assertFalse(any("nahled" in x for x in p.values()))


if __name__ == "__main__":
    unittest.main(verbosity=2)
