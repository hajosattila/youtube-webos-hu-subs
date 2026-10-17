# Magyar automatikus feliratfordítás

Ez a változat a YouTube saját fordítási szolgáltatásával kér magyar feliratot.
Nem tartalmaz DeepL-integrációt vagy új külső függőséget.

## Kipróbálás LG webOS tévén

1. Telepítsd a módosított IPK-t a megszokott webOS Dev Managerrel.
2. Zárd be teljesen az alkalmazást, majd indítsd újra. Ha a régi alkalmazás a
   háttérben maradt, az új kód még nem feltétlenül töltődött be.
3. Nyiss meg egy olyan videót, amelyhez van működő, fordítható felirat,
   például angol automatikusan generált felirat.
4. A videó YouTube-feliratmenüjében keresd a
   **Magyar (automatikus fordítás)** lehetőséget, és válaszd ki.
   A TV felületétől függően a lista megjelenítése eltérhet.
5. Ellenőrizd, hogy magyar szöveg jelenik meg, és a videóhoz igazodik.
   Próbáld ki az előre/hátra tekerést és egy másik videót is.

A funkció alapból engedélyezett, de nem választja ki automatikusan a magyar
feliratot. A zöld gombbal megnyitható alkalmazásmenüben az
**Add Hungarian auto-translated subtitles (reopen video)** kapcsolóval
kikapcsolható. A kapcsoló átállítása után nyisd meg újra a videót, hogy új
lejátszóválasz töltődjön be.

Meglévő magyar feliratsáv mellé nem kerül újabb magyar sáv. Felirat nélküli
videóhoz a funkció nem készít beszédfelismerést, és a kifejezetten nem
fordítható sávokat sem használja. Több hangsáv esetén az alapértelmezett
hangsáv feliratforrását részesíti előnyben, és csak az ehhez a forráshoz
kapcsolódó feliratlistákat bővíti; más hangsávra váltva az új opció hiányozhat.

## Mit módosít a kód?

A meglévő `JSON.parse` hook mögé kapcsolódva a YouTube player-válaszában
keres fordítható feliratsávot. A meglévő sáv címét `tlang=hu` célnyelvvel
használja fel egy új, magyar sávhoz. Az eredeti forrásnyelv és a kérés
hitelesítési paraméterei megmaradnak; az eredeti sáv és az alapértelmezett
feliratválasztás nem változik. Az új sáv indexe a hozzá tartozó hangsávok
feliratlistáiba is bekerül.

Ha a válasz külön `translationLanguages` listát is tartalmaz, abba is
bekerül a magyar nyelv. A TV-kliensek ezt nem feltétlenül használják:
a közvetlen magyar feliratsáv az asztali Auto-translate almenü nélküli
felületekhez is készült. A megközelítés előzménye az upstream
[#472 PR](https://github.com/webosbrew/youtube-webos/pull/472).

## Ellenőrzések és korlátok

```sh
pnpm run test:subtitles
pnpm run lint:all
pnpm run build:dev
pnpm run test:compat
pnpm run build
pnpm run test:compat
pnpm run package
```

A célzott tesztek a válaszadatok módosítását, a fordítási URL-t, a hangsávok
indexeit, a meglévő magyar felirat megőrzését és a parse-hook együttműködését
ellenőrzik. Nem kérnek élő YouTube-fordítást.

A sikeres build és a magyar menüpont önmagában nem bizonyítja a fordítás
működését. A YouTube szerverének tényleges válaszát és a tévén megjelenő
szöveget külön kell ellenőrizni. A fejlesztés felhőkörnyezetében a YouTube
elérését a hálózati proxy 403-mal blokkolta, LG tévé pedig nem volt csatlakoztatva.
Ezért ez a kiadás TV-n ellenőrizendő tesztváltozat.

A kiegészítő Chromium-próba sem adott eredményt: ebben a környezetben már
egy üres tesztoldal megnyitása is időtúllépéssel végződött. A böngészős
integrációs ellenőrzés ezért nincs sikeresként elszámolva.

Ha a magyar opció látható, de nincs szöveg, a TV DevTools Network paneljén
ellenőrizhető a `timedtext` kérés: szerepel-e benne `tlang=hu`, milyen a
státuszkód, illetve tartalmaz-e a válasz magyar szöveget és időzítést.
A HTTP 200 üres válasszal nem sikeres feliratteszt.
Az upstream [#306 hibajegy](https://github.com/webosbrew/youtube-webos/issues/306)
hasonló, látható opció melletti fordítási hibáról számol be.

Hibajelzéshez a videóazonosító, a kapcsoló állapota, a menüben látott név,
a státuszkód és a tévén tapasztalt viselkedés hasznos. Cookie-t, tokent vagy
teljes, aláírt felirat-URL-t ne ossz meg. A modul saját naplója nem írja ki
ezeket az URL-eket.
