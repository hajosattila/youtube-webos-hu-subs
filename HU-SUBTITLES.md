# Magyar automatikus feliratfordítás

Ez a változat a YouTube saját fordítási szolgáltatásával kér magyar feliratot.
Nem tartalmaz DeepL-integrációt vagy új külső függőséget.

## Kipróbálás LG webOS tévén

1. Telepítsd a módosított IPK-t a megszokott webOS Dev Managerrel.
2. Zárd be teljesen az alkalmazást, majd indítsd újra. Ha a régi alkalmazás a
   háttérben maradt, az új kód még nem feltétlenül töltődött be.
3. Nyiss meg egy olyan videót, amelyhez van működő, fordítható felirat,
   például angol automatikusan generált felirat.
4. Idegen (például angol) hangsáv esetén a magyar feliratnak automatikusan
   be kell kapcsolódnia, ha van elérhető magyar feliratsáv.
5. Ellenőrizd, hogy magyar szöveg jelenik meg, és a videóhoz igazodik.
   Próbáld ki az előre/hátra tekerést és egy másik videót is.

A magyar fordítás felkínálása állandóan engedélyezett. A zöld gombos
alkalmazásmenüből eltűnt a külön magyar feliratkapcsoló. A régebbi verzióban
elmentett kapcsolóállapotot az új verzió nem használja.

Új videó indulásakor és a kiválasztott hangsáv nyelvének váltásakor:

- Magyar hang esetén alapból kikapcsolja a feliratot.
- Idegen hang esetén az elérhető magyar feliratot választja ki.
- Ismeretlen nyelv esetén nem avatkozik be. Nem következtet a videócím vagy
  a feliratok nyelvéből, és nem változtatja meg a hangsávot.

A kezdeti beállítás után a kézi feliratválasztás elsőbbséget kap: az
automatika nem kapcsolgatja vissza a kézzel ki- vagy bekapcsolt feliratot.
A következő videónál vagy más nyelvű hangsávra váltáskor új alapbeállítás
érvényesül. A betűméretet, színt, hátteret és egyéb formázást nem módosítja.

Az automatika a YouTube-lejátszó meglévő hangsáv- és feliratkezelő függvényeit
használja. Ha ezek hiányoznak vagy nem adnak nyelvi adatot, megmarad a kézi
feliratválasztás lehetősége. A később betöltődő feliratlistára legfeljebb
körülbelül 12 másodpercig vár. Felirat nélküli videón nem készít beszédfelismerést.

TV-s ellenőrzéshez próbálj egymás után angol, magyar, majd ismét angol
hangú videót. Ellenőrizd a kézi feliratkapcsolás megtartását is ugyanazon
videón belül, és ha van rá lehetőség, a hangsáv nyelvének váltását.

A CC-javítást tartalmazó változat a felirat tényleges be-/kikapcsolt állapotát
is kezeli. A magyar sáv kiválasztása önmagában nem jelentett bekapcsolt CC-t:
ez különösen az alkalmazás újraindítása után okozhatott hibát.
A javítás a CC állapotát lekérdezi, szükség esetén bekapcsolja, és csak
bekapcsolt CC plusz visszaolvasott magyar sáv esetén jelzi sikeresnek a műveletet.
Az újraindítást utánzó tesztek külön tárolják a sávválasztást és a CC állapotát.

Az új IPK-nál ezt is próbáld ki: angol videó → teljes alkalmazásbezárás →
újraindítás → ugyanaz a videó, a CC gomb megnyomása nélkül.
Ezután ellenőrizd egy magyar videón, hogy alapból nincs felirat.

Ha az automatika körülbelül 12 másodperc után sem tudja igazolni a bekapcsolást,
egyszeri, tíz másodpercig látható üzenetet adhat. Az `A1` olvashatatlan
hangsávnyelvet, a `C0` hiányzó feliratválasztó függvényt, a `C2` nem igazolható
bekapcsolást, a `P1` lejátszó-API hibát jelez. Ezeket a kódokat elég megírni;
nem tartalmaznak tokent vagy aláírt URL-t. Hiányzó magyar sávnál nem kapcsol
be helyette egy másik nyelvet. A kézi CC gomb továbbra is használható.

Meglévő magyar feliratsáv mellé nem kerül újabb magyar sáv. Felirat nélküli
videóhoz a funkció nem készít beszédfelismerést, és a kifejezetten nem
fordítható sávokat sem használja. Több hangsáv esetén az alapértelmezett
hangsáv feliratforrását részesíti előnyben, és csak az ehhez a forráshoz
kapcsolódó feliratlistákat bővíti; más hangsávra váltva az új opció hiányozhat.

## A1 diagnosztikai tesztváltozat

Ha az automatikus felirat az A1 ponton áll meg, a `hu-auto-diag` csomag egy
percig megjeleníti a `DIAG A1` adatblokkot. Nyiss meg egy angol videót, várj
körülbelül 12 másodpercet, és fotózd le ezt a blokkot. Ez adatgyűjtési
tesztváltozat: az A1 hibát még nem javítja, és nem helyettesíti az ismeretlen
hangsávnyelvet feltételezett angollal.

Az 1/0 jelzések a kiolvasó függvények elérhetőségét mutatják. Az A/O/L/V
sorok a hangsáv, az opció, az elérhető hangsávok és a videóadatok
szűrt szerkezetét írják le. Az RA/RC sorok a lejátszóválasz hangadatait
foglalják össze. Az alkalmazás nem továbbítja ezt az adatot sehova.
Csak rövid nyelvi azonosítók, mezőnevek és állapotjelzők jelenhetnek meg;
a tokenek, URL-ek, videócímek és más tetszőleges szöveges értékek kimaradnak.
A kód nem változtatja meg a hangsávot, a menüt vagy a felirat formázását.

## Natív hangsávadat és DIAG v2

A tévéről kapott két diagnosztikai képen a YouTube `getAudioTrack()`
függvénye `id=und` értéket adott, használható nyelvi adat nélkül.
Az `und` nem tekinthető angolnak. A `hu-auto-diag2` változat ezért a
videóelem natív `audioTracks` listáját is megvizsgálja: kizárólag pontosan
egy engedélyezett hangsáv `language` értékét fogadja el. Nem következtet
a sáv sorszámából, átlátszatlan azonosítójából vagy a felirat nyelvéből.
Ellentmondó nyelvi adatoknál sem kapcsol be automatikusan feliratot.

Ez csak akkor segít, ha a webOS a natív hangsávnál valódi nyelvet közöl.
Ha az is hiányzik vagy `und`, az automatika továbbra sem tud biztonságosan
különbséget tenni magyar és idegen beszéd között. Beszédfelismerést nem végez.

A `DIAG ... v2` blokkban a `MEDIA` sor a natív hangsávlistát, az `ACTIVE`
sor az egyetlen engedélyezett hangsávot mutatja. Az `API` sorok kizárólag
a hangsáv- és feliratkezelő függvények nevét sorolják fel. A diagnosztika
az A1 mellett C2 hibánál is látható. A felirat bekapcsolásához a kód a
`toggleSubtitlesOn` elnevezést is támogatja, ha a lejátszóban létezik;
az eredményt az `isSubtitlesOn` állapotból ellenőrzi.

## Mit módosít a kód?

A meglévő `JSON.parse` hook mögé kapcsolódva a YouTube player-válaszában
keres fordítható feliratsávot. A meglévő sáv címét `tlang=hu` célnyelvvel
használja fel egy új, magyar sávhoz. Az eredeti forrásnyelv és a kérés
hitelesítési paraméterei megmaradnak; az eredeti sáv nem változik.
Az új sáv indexe a hozzá tartozó hangsávok
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
ellenőrzik. Az automatika tesztjei a magyar és idegen hangot, a videó- és
hangsávváltást, a későn érkező adatokat és a kézi választás megtartását is
vizsgálják. Nem kérnek élő YouTube-fordítást.

A sikeres build és a magyar menüpont önmagában nem bizonyítja a fordítás
működését. A YouTube szerverének tényleges válaszát és a tévén megjelenő
szöveget külön kell ellenőrizni. A fejlesztés felhőkörnyezetében a YouTube
elérését a hálózati proxy 403-mal blokkolta, LG tévé pedig nem volt csatlakoztatva.
A korábbi, kézzel választható magyar fordítást a felhasználó már működőként
visszaigazolta a tévén. Az új automatikus kiválasztás még TV-n ellenőrizendő.

Ha a magyar opció látható, de nincs szöveg, a TV DevTools Network paneljén
ellenőrizhető a `timedtext` kérés: szerepel-e benne `tlang=hu`, milyen a
státuszkód, illetve tartalmaz-e a válasz magyar szöveget és időzítést.
A HTTP 200 üres válasszal nem sikeres feliratteszt.
Az upstream [#306 hibajegy](https://github.com/webosbrew/youtube-webos/issues/306)
hasonló, látható opció melletti fordítási hibáról számol be.

Hibajelzéshez a videóazonosító, a kiválasztott hangsáv nyelve, a menüben látott név,
a státuszkód és a tévén tapasztalt viselkedés hasznos. Cookie-t, tokent vagy
teljes, aláírt felirat-URL-t ne ossz meg. A modul saját naplója nem írja ki
ezeket az URL-eket.
