# YouTube Ad-Free kliens LG webOS-re, magyar automatikus feliratfordítással.

A [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos) magyar feliratos változata LG webOS tévékre. Az eredeti alkalmazás reklámblokkolását, SponsorBlock-támogatását és lejátszási beállításait egészíti ki.

<img width="2560" height="1440" alt="scrn_20261124_141248" src="https://github.com/user-attachments/assets/25481cc4-9912-4d3c-ad10-589b75b1cf0f" />

## Miben tér el az eredetitől?

- A feliratlista elején külön **Magyar (automatikus fordítás)** sáv jelenhet meg a fordítható videóknál. A feliratot kézzel, a CC gombbal vagy a YouTube menüjében kapcsolhatod be.
- Ez a tesztág az első magyar változat feliratválasztását használja. Az alapértelmezett hangsávon belül a kézzel készített feliratot részesíti előnyben az automatikus átirattal szemben. A fordítást és az időzítést a YouTube szolgáltatja.

## Telepítés és használat

1. Ha a hivatalos YouTube alkalmazás telepítve van, távolítsd el a tévéről.
2. Töltsd le a [tesztág telepítőjét](downloads/youtube.leanback.v4_0.5.3_all-hu.ipk?raw=true), és telepítsd a [webOS Dev Managerrel](https://github.com/webosbrew/dev-manager-desktop), majd teljesen zárd be és indítsd újra az alkalmazást.
3. Egy feliratos videón nyisd meg a feliratmenüt, és válaszd a **Magyar (automatikus fordítás)** sávot. A távirányító zöld gombja nyitja az alkalmazás beállításait.

A [magyar felirat útmutatója](HU-SUBTITLES.md) tartalmazza a feliratkezelés és a build részleteit. Az eredeti alkalmazás további telepítési lehetőségei az [upstream dokumentációban](https://github.com/webosbrew/youtube-webos#development-setup) olvashatók.

Az alkalmazás licence [GPL-3.0-only](LICENSE).
