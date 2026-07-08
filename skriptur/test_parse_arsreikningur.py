#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Eining­próf fyrir to_num í parse_arsreikningur.py — íslensk tölu­þáttun.

Bakgrunnur (LOTA 111): Arion banki (kt 5810080150) þáttaðist rangt — sölu-/hagnaðar­
línur í rekstrarreikningi nota KOMMU sem þúsundaskil ('78,391' = 78391), en to_num
las kommu ALLTAF sem aukastaf → 78,391 varð 78.391 (~1000x of lágt), eignavelta rúnn í 0.
Íslandsbanki (líka banki) notar aftur á móti PUNKT ('63.057' = 63057) og þáttaðist rétt.

Prófið læsir bæði: (a) komma-þúsund verði heiltala, (b) raunverulegir komma-aukastafir
og punkt-þúsund haldist ÓBREYTT (engin ný regression).

Keyrsla:  python -m unittest skriptur/test_parse_arsreikningur.py
     eða: python skriptur/test_parse_arsreikningur.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_arsreikningur import to_num


class ToNumTests(unittest.TestCase):

    def test_comma_thousands_become_integer(self):
        # Arion rekstrar­línur: komma = þúsundaskil. Þessi féllu áður (78,391 -> 78.391).
        self.assertEqual(to_num('78,391'), 78391)    # Arion 2024 sala
        self.assertEqual(to_num('44,984'), 44984)    # Arion 2024 hagn_f_skatt
        self.assertEqual(to_num('19,041'), 19041)    # Arion 2025 sala
        self.assertEqual(to_num('8,044'), 8044)      # Arion 2025 hagn_f_skatt
        self.assertEqual(to_num('123,456'), 123456)  # almennt: 1-3 stafa heiltala + 3ja-stafa hópur

    def test_comma_thousands_are_int_type_not_float(self):
        # Heiltala, ekki 78391.0 — svo eignavelta o.fl. reiknist rétt og JSON verði hreint.
        v = to_num('78,391')
        self.assertIsInstance(v, int)

    def test_real_comma_decimals_stay_decimal(self):
        # ⚠ Má EKKI brjóta raunverulega aukastafi (hlutföll/gengi). 1-2 (eða !=3) stafir e. kommu.
        self.assertAlmostEqual(to_num('0,17'), 0.17)
        self.assertAlmostEqual(to_num('12,5'), 12.5)
        self.assertAlmostEqual(to_num('1,5'), 1.5)
        # Leiðandi '0,' = ótvírætt aukastafur, jafnvel með 3 stafi (0,123 er ALDREI 0 þúsund 123).
        self.assertAlmostEqual(to_num('0,123'), 0.123)

    def test_period_thousands_unchanged(self):
        # Íslensk þúsundaskil með punkti — óbreytt hegðun (Íslandsbanki, efnahagur Arion).
        self.assertEqual(to_num('78.391'), 78391)
        self.assertEqual(to_num('63.057'), 63057)     # Íslandsbanki sala
        self.assertEqual(to_num('1.234.567'), 1234567)
        self.assertEqual(to_num('1.618.267'), 1618267)  # Arion eignir

    def test_period_thousands_with_comma_decimal_unchanged(self):
        # Blandað: punktur = þúsund, komma = aukastafur.
        self.assertAlmostEqual(to_num('1.234.567,89'), 1234567.89)

    def test_negatives_in_parens(self):
        self.assertEqual(to_num('(85.957)'), -85957)   # Arion fjarmagnsgjold (punkt-þúsund)
        self.assertEqual(to_num('(78,391)'), -78391)   # komma-þúsund í sviga

    def test_plain_integers_and_junk(self):
        self.assertEqual(to_num('222'), 222)
        self.assertEqual(to_num('5686'), 5686)
        self.assertIsNone(to_num('abc'))
        self.assertIsNone(to_num(''))


if __name__ == '__main__':
    unittest.main(verbosity=2)
