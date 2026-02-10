TRENING PORTAL (NO-CODE)

CILJ:
- Igralci dobijo EN link in sami pogledajo urnik.
- Ti (admin) urejaš: igralce, trenerje, lokacije, treninge + ponavljanja.
- Ne urejaš HTML.

LOKALNO (1 KLIK):
1) Dvojni klik: START_WEBSITE.cmd
2) Odpre: http://localhost:8080/index.html
3) Admin: http://localhost:8080/admin.html
   PIN je v content/admin/pin.txt

SHRANJEVANJE:
- Admin spremembe se shranijo lokalno v brskalniku (takoj vidiš na tej napravi).
- Igralci na drugih napravah vidijo šele, ko objaviš.

HOSTING:
- Statika. Admin UI izvoz/uvoz db.json.
- Po izvozu zamenjaš datoteko /data/db.json na hostingu.

TEKSTI:
- content/.../*.txt (naslovi, opisi, kontakt, ...)
- PIN: content/admin/pin.txt
