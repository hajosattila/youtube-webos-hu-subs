# Magyar feliratfordítás

Ez a tesztváltozat a YouTube saját magyar feliratfordítását kéri.
A feliratot kézzel kapcsolhatod be a CC gombbal vagy a YouTube menüjében.

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

A [fork első magyar változata](https://github.com/hajosattila/youtube-webos-hu-subs/commit/5d6cd0dbd545df7c97c63f6ff0f6ef96159847f7) alapján a kliens az alapértelmezett hangsáv feliratlistájában keres először kézi, majd automatikusan készített feliratot. Ha ott nincs használható sáv, a többi elérhető sávot vizsgálja meg. A kiválasztott sáv YouTube-címében a `tlang=hu` paraméter kéri a magyar fordítást. A lekérést és a válasz megjelenítését a YouTube lejátszója végzi.

A `VzKA9ayxZMY` videón a fő feliratlistában válaszd a **Magyar (automatikus fordítás)** sávot. A próba akkor sikeres, ha a beszédhez időzítve megjelenik a magyar szöveg. A tesztcsomagban a magyar fordítás egyetlen forrása a YouTube.

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
