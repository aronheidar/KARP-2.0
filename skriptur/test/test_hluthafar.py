#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Keyrt: python skriptur/test/test_hluthafar.py   (engin ytri háð nema pdfplumber sem er þegar til)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from parse_arsreikningur import hluthafar_from_lines

def eq(got, exp, msg):
    assert got == exp, f"{msg}\n  fékk: {got!r}\n  vænti: {exp!r}"

# 1) Nafn + kt (með bandstriki) + prósenta
r = hluthafar_from_lines(["A20 ehf. 430269-4459 50%"])
eq(r, [{'nafn': 'A20 ehf.', 'kt': '4302694459', 'hlutur': 50.0}], "nafn+kt+%")

# 2) Íslensk prósenta með kommu, kt án bandstriks
r = hluthafar_from_lines(["Universal Export 6009780129 20,5%"])
eq(r, [{'nafn': 'Universal Export', 'kt': '6009780129', 'hlutur': 20.5}], "komma-%")

# 3) Einstaklingur án kt
r = hluthafar_from_lines(["Kolbeinn Hannibalsson 10%"])
eq(r, [{'nafn': 'Kolbeinn Hannibalsson', 'kt': None, 'hlutur': 10.0}], "án kt")

# 4) Línur án prósentu = ekki hluthafi (haus, samtala, prósa)
r = hluthafar_from_lines(["Hluthafar", "Eiginfjárhlutfall félagsins er sterkt", "Samtals"])
eq(r, [], "engin %-lína")

# 5) Prósenta > 100 eða 0 = hafnað (t.d. fjárhæð sem endar á %)
r = hluthafar_from_lines(["Eitthvað 0%", "Annað 250%"])
eq(r, [], "utan marka")

print("test_hluthafar: OK")
