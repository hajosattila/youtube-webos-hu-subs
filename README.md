# YouTube Ad-Free magyar felirattal LG webOS-re

A [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos) magyar feliratos változata LG webOS tévékre. Az eredeti alkalmazás reklámblokkolását, SponsorBlock-támogatását és lejátszási beállításait egészíti ki.

## Miben tér el az eredetitől?

- A feliratlista elején külön **Magyar (automatikus fordítás)** sáv jelenhet meg a fordítható videóknál. A feliratot kézzel, a CC gombbal vagy a YouTube menüjében kapcsolhatod be.
- A lejátszó először a YouTube saját fordítását kéri. Ha üres választ kap, másik elérhető feliratforrásból is megpróbálja.
- A Google Fordító tartalékként működik az aktuális munkamenetben nyilvánosként azonosított videóknál. Ilyenkor csak a feliratszöveget küldi el. A feliratot továbbra is a YouTube lejátszója jeleníti meg.

## Telepítés és használat

1. Ha a hivatalos YouTube alkalmazás telepítve van, távolítsd el a tévéről.
2. Töltsd le az IPK-t a [GitHub Kiadások oldaláról](https://github.com/hajosattila/youtube-webos-hu-subs/releases/latest), és telepítsd a [webOS Dev Managerrel](https://github.com/webosbrew/dev-manager-desktop), majd teljesen zárd be és indítsd újra az alkalmazást.
3. Egy feliratos videón nyisd meg a feliratmenüt, és válaszd a **Magyar (automatikus fordítás)** sávot. A távirányító zöld gombja nyitja az alkalmazás beállításait.

A [magyar felirat útmutatója](HU-SUBTITLES.md) tartalmazza a feliratkezelés és a build részleteit. Az eredeti alkalmazás további telepítési lehetőségei az [upstream dokumentációban](https://github.com/webosbrew/youtube-webos#development-setup) olvashatók.

Az alkalmazás licence [GPL-3.0-only](LICENSE).
