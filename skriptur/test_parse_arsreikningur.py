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

    def test_multi_group_comma_thousands(self):
        # Ensk-sniðnar skýrslur (Icelandair '1,863,734', Geo Travel '131,363,175') — LOTA 115.
        self.assertEqual(to_num('1,863,734'), 1863734)
        self.assertEqual(to_num('131,363,175'), 131363175)
        self.assertEqual(to_num('(1,863,734)'), -1863734)
        # eins-hóps reglan óbreytt: '0,123' er aukastafur, ekki þúsund
        self.assertAlmostEqual(to_num('0,123'), 0.123)


# ── LOTA 115: 100-félaga þversnið → rows_of_page tákna-pípa + take_years ─────────
from parse_arsreikningur import join_parens, unfuse, _clean_tok, _mergeable_nums, take_years


class TokenPipeTests(unittest.TestCase):
    """Svigasamruni + leiðara-afbræðsla — brestir úr 100-félaga prófuninni."""

    def test_join_parens_simple(self):
        # Íslandshótel: '(' '282.838' ')' → neikvæð tala (formerki tapaðist áður)
        self.assertEqual(join_parens(['(', '282.838', ')']), ['(282.838)'])

    def test_join_parens_split_leading_digit(self):
        # RARIK: '(' '8' '91.133)' → -891133 (fremsti stafur síaðist áður sem skýringarnr)
        self.assertEqual(join_parens(['(', '8', '91.133)']), ['(891.133)'])
        # Ístak: '(' '2' '56.384)' → -256384
        self.assertEqual(join_parens(['(', '2', '56.384)']), ['(256.384)'])

    def test_join_parens_leaves_whole_tokens(self):
        # samföst '(50.478)' fara óbreytta leið (engin regressjón)
        self.assertEqual(join_parens(['(50.478)', '61']), ['(50.478)', '61'])

    def test_unfuse_leader_glued(self):
        # punktaleiðari límdur í tölu: '3...558.639' → 3558639
        self.assertEqual(unfuse('3...558.639'), '3558639')
        # lögleg íslensk tala ósnert ('..' kemur aldrei fyrir í henni)
        self.assertEqual(unfuse('1.234.567'), '1.234.567')

    def test_clean_tok_strips_leader_edges(self):
        self.assertEqual(_clean_tok('.....3.558'), '3.558')
        self.assertEqual(_clean_tok('31.12.2024'), '31.12.2024')   # dagsetning ósnert (endar á tölustaf)

    def test_mergeable_nums(self):
        self.assertFalse(_mergeable_nums(['375']))            # stakt síðutal/smátala límist ekki
        self.assertFalse(_mergeable_nums(['2024', '2023']))   # ártala-dálkahaus límist aldrei
        self.assertTrue(_mergeable_nums(['15.498.868', '22.713.342']))


class TakeYearsTests(unittest.TestCase):
    """Front-only skýringarnr-strípun + stakt-skýringarnr-vörnin (Samskip eigid_fe→12 gildran)."""

    def test_noteref_stripped_front_only(self):
        # ['6','155','16']: '6' er skýringarnr, '16' er raunveruleg fjárhæð aftast
        self.assertEqual(take_years(['6', '155', '16']), (155, 16))

    def test_lone_noteref_is_not_amount(self):
        # kaflahaus 'Eigið fé  12' má ALDREI verða fjárhæð
        self.assertEqual(take_years(['12']), (None, None))

    def test_dates_filtered(self):
        self.assertEqual(take_years(['31.12.2024', '31.12.2023', '5.100', '4.200']), (5100, 4200))

    def test_normal_two_amounts(self):
        self.assertEqual(take_years(['15.498.868', '22.713.342']), (15498868, 22713342))
        self.assertEqual(take_years(['(516)', '61']), (-516, 61))


if __name__ == '__main__':
    unittest.main(verbosity=2)
