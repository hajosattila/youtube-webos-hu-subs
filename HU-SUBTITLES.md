# Magyar feliratfordítás

Ez a fork a YouTube fordításával és Google Fordító-tartalékkal kínál magyar feliratot. A feliratot
kézzel, a CC gombbal vagy a YouTube feliratmenüjében kell bekapcsolni.
A zöld gombos alkalmazásmenüben nincs külön magyar feliratkapcsoló.
A korábbi kapcsoló elmentett értéke nem befolyásolja a működést.

Az alkalmazás a YouTube feliratmenüjét és a lejátszó feliratmegjelenítését használja.

## Telepítés és használat

1. Töltsd le az [aktuális, 0.5.3-as IPK-t](downloads/youtube.leanback.v4_0.5.3_all-hu.ipk?raw=true).
2. Telepítsd a webOS Dev Managerrel, majd teljesen zárd be és indítsd újra az alkalmazást.
3. Nyiss meg egy működő, fordítható felirattal rendelkező videót.
4. A feliratok fő listájában keresd a **Magyar (automatikus fordítás)** sávot az első meglévő feliratsáv után. A **Magyar** opció az **Automatikus fordítás** almenüben is elérhető, ha a YouTube megjeleníti az almenüt.
5. A CC gombbal kézzel ki- és bekapcsolhatod a feliratot.

Meglévő magyar felirat mellé nem készül újabb magyar sáv. Felirat nélküli
videóhoz nem készít beszédfelismerést. Több hangsáv esetén az új opció
elérhetősége a kiválasztott hangsáv feliratlistájától is függ.

## Magyar fordítás

A meglévő JSON.parse hook a YouTube fordítási nyelvlistáját szükség esetén
kiegészíti a magyar nyelvvel. A fordítás lekérését és megjelenítését a
YouTube lejátszója végzi a kiválasztott forrássávhoz. A fő feliratlistához
adott magyar sáv ugyanezt a fordítást kéri a timedtext címhez fűzött
`tlang=hu` paraméterrel. A forrássáv címében lévő
paraméterek kódolása megmarad. Az új sáv indexe a kapcsolódó hangsávok
feliratlistájába kerül.

Üres magyar válasznál az alkalmazás figyelembe veszi az ugyanebben a munkamenetben
sikeresen betöltött eredeti feliratot vagy más nyelvre fordított sávot is. Ha a
forrássáv, formátum és szegmens egyezik, a működő kérésben csak a célnyelvet
cseréli magyarra. A lejátszó másik elérhető YouTube-forrásból is kérhet fordítást.
Ha csak az első kérés ismételhető meg, és a teljes sávra üres HTTP 200 válasz
érkezett, 400 ms múlva egyszer megismétli a magyar kérést. Egy kiválasztáshoz
legfeljebb két további YouTube-fordítási kérést küld. HTTP 429 válasznál befejezi
az adott kérés fordítási próbálkozásait. Ha a YouTube-tól továbbra sincs szöveg,
az eredeti felirat szövegét csak akkor fordítja le a Google Fordítóval, ha a
YouTube az aktuális munkamenetben nyilvánosként azonosította a videót. A Google Fordító
felé csak feliratszöveg kerül, a videóazonosító, az aláírt feliratcím és a
YouTube-sütik továbbítása nélkül. A felirat időzítése megmarad.

A megadott `VzKA9ayxZMY` videón a **Magyar (automatikus fordítás)** közvetlen
kiválasztásával lehet ellenőrizni a javítást. A webOS webes felügyelőjének konzolja jelzi,
hogy a magyar szöveget a YouTube adta-e az első kérésre vagy másik forrássávból,
illetve hogy a Google Fordító adta-e. A `Recovered Hungarian captions with Google Translate`
üzenet igazolja a tartalék használatát. Az üres vagy hibás első válasznál a napló
a HTTP-státuszkódot is mutatja.

A megközelítés előzménye az upstream [#472 PR](https://github.com/webosbrew/youtube-webos/pull/472).
A kód és az eredeti tesztek a korábban működő magyar fordításra épülnek;
a későbbi automatikus kapcsolási kísérletek nem részei a jelenlegi forrásnak.

## Fejlesztés és ellenőrzés

Használd a package.json által előírt Node.js és pnpm verziót.

```sh
pnpm install --frozen-lockfile --public-hoist-pattern=@babel/runtime
pnpm run test:subtitles
pnpm run lint:all
pnpm run build
pnpm run test:compat
pnpm run package
```

A csomagolás a projekt gyökerében hozza létre az IPK-t; ezt a .gitignore
kizárja a véletlen commitolásból. A downloads mappában egyetlen aktuális
telepítő és a hozzá tartozó SHA-256 ellenőrzőösszeg marad.
A helyi tesztek mintaválaszokat használnak. Új verziónál a magyar szöveg
megjelenését, az időzítést és a kézi CC-kapcsolást a tévén is ellenőrizni kell.

## Későbbi frissítések

A main az egyetlen aktív ág. Új eredeti kliensverziónál a webosbrew/youtube-webos
változtatásait ebből kiindulva, külön ideiglenes fejlesztői ágon kell beemelni,
a működő magyar fordítás megtartásával. Új klónozás általában nem szükséges.
Az ellenőrzések és a TV-s próba után a frissítés beolvasztható a main ágba;
az ideiglenes ág törölhető, a downloads telepítője pedig lecserélhető az újra.

A korábbi kísérletek a Git-előzményekben megmaradnak, de nincsenek benne
az aktuális fájlkészletben. Hibajelzéshez a videóazonosító és a tapasztalt
viselkedés elegendő kiindulás; cookie-t, tokent vagy aláírt felirat-URL-t ne ossz meg.
