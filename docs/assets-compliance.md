# resurse externe — conformitate (criterii VI.2)

Lista completa a resurselor externe folosite in DevLife. Versiunile si licentele sunt cele ale
pachetelor instalate efectiv (`frontend/package.json`, `requirements.txt`).

## assets grafice

Nu exista assets grafice externe. Toata grafica — mobilier, personaje, camera izometrica,
scenele din oras — este desenata procedural din cod, cu `PIXI.Graphics`. Niciun sprite sheet,
tileset sau asset pack.

Pachetul de sprite-uri izometrice folosit intr-o faza timpurie a fost eliminat din arborele de
lucru impreuna cu incarcatorul lui.

## audio

Toate sunetele sunt sintetizate in timp real prin Web Audio API, in
`frontend/src/audio/SoundManager.js`. Nu exista niciun fisier audio in proiect.

Fisierul `devlife.mp3` (muzica ambientala, provenienta neclara) a fost sters; difuzorul din
camera ramane silentios in absenta lui.

## fonturi

Livrate self-hosted ca `.woff2` in `frontend/public/lib/fonts/` si incarcate prin
`/lib/fonts/fonts.css` (`frontend/index.html`), nu prin CDN: interfata trebuie sa arate identic
si fara conexiune la internet, pentru demo offline.

| font | rol in interfata | licenta |
|------|------------------|---------|
| Fredoka | titluri, numele starii cognitive | SIL OFL 1.1 |
| Nunito | text curent, etichete | SIL OFL 1.1 |
| JetBrains Mono | cifrele biometrice live si terminalul — latimea fixa a cifrelor le tine pe loc la actualizare | SIL OFL 1.1 |

## biblioteci JavaScript

| biblioteca | versiune | unde se foloseste | licenta |
|------------|----------|-------------------|---------|
| pixi.js | 7.4.3 | randarea camerei 2.5D si a scenelor | MIT |
| monaco-editor | 0.55.1 | editorul din IDE-ul din joc (`src/apps/monaco/monacoSetup.js`) | MIT |
| @xterm/xterm | 5.5.0 | terminalul din joc (`src/apps/Terminal.js`) | MIT |
| @xterm/addon-fit | 0.11.0 | redimensionarea terminalului la fereastra | MIT |
| JSCPP | 2.0.9 | interpretorul C++ care ruleaza in browser (`src/apps/runners/cppWorker.js`) | MIT |
| howler | 2.2.4 | redarea sunetelor sintetizate | MIT |
| vite | 5.4.21 | bundler si server de dezvoltare | MIT |
| terser | 5.47.1 | minificare la build | BSD-2-Clause |
| ws | 8.19.0 | server WebSocket folosit doar la testare locala | MIT |

## Pyodide

| resursa | versiune | rol | licenta |
|---------|----------|-----|---------|
| Pyodide | 0.26.4 | ruleaza Python real in browser, in Web Worker, pentru butonul Run din editor | MPL-2.0 |

Pyodide **nu** se afla in repository: are ~1.2 GB si e exclus prin `.gitignore`. Se descarca la
instalare cu `./scripts/setup-pyodide.sh`, din release-urile oficiale de pe GitHub. Distributia
lui include fonturi proprii (STIX, DejaVu), cu licentele in `fonts/LICENSE_STIX` si
`fonts/LICENSE_DEJAVU`; acestea nu fac parte din codul predat.

## biblioteci Python

Dependinte directe, cu rol functional:

| biblioteca | versiune | unde se foloseste | licenta |
|------------|----------|-------------------|---------|
| fastapi | 0.133.0 | serverul HTTP + WebSocket | MIT |
| uvicorn | 0.41.0 | serverul ASGI | BSD-3-Clause |
| pydantic | 2.12.5 | validarea datelor de intrare, contractul Apply Fix | MIT |
| anthropic | 0.83.0 | clientul pentru Claude API | MIT |
| httpx | 0.28.1 | apelurile catre WHOOP API (OAuth2) | BSD-3-Clause |
| websockets | 16.0 | protocolul WebSocket | BSD-3-Clause |
| slowapi | 0.1.9 | limitarea ratei pe endpoint-uri | MIT |
| python-dotenv | 1.2.1 | incarcarea configuratiei din `.env` | BSD-3-Clause |
| watchfiles | 1.2.0 | reload la dezvoltare | MIT |
| numpy | 2.4.2 | analiza numerica a capturilor de ecran | BSD-3-Clause (si altele, vezi pachet) |
| scipy | 1.17.1 | prelucrarea semnalului | BSD |
| pillow | 12.1.1 | manipularea imaginilor capturate | MIT-CMU |
| ImageHash | 4.3.2 | detectarea ecranelor identice, ca sa nu fie re-analizate | BSD-2-Clause |
| PyWavelets | 1.9.0 | dependinta a ImageHash | MIT si BSD-3-Clause |
| mss | 10.1.0 | captura de ecran | MIT |
| pytest, pytest-asyncio | 9.0.3 / 1.x | suita de teste | MIT |

Dependintele tranzitive (starlette, anyio, httpcore, certifi, idna, h11, typing_extensions,
jiter, distro, click, sniffio si celelalte) sunt fixate integral in `requirements.txt`.

## servicii externe

| serviciu | rol | date trimise |
|----------|-----|--------------|
| Claude API (Anthropic) | analiza contextului si replicile ghost-ului | continutul aplicatiei active si un rezumat de stare |
| WHOOP API (OAuth2) | recovery, strain, somn, HRV zilnic | nimic; doar se citeste |
| Spotify Web API | piesa curenta, optional | nimic; doar se citeste |

Fara chei configurate aplicatia porneste si ruleaza: biometria vine din generatorul mock, iar
ghost-ul foloseste replicile pre-scrise din `fallback_responses.py`.

## asistenta AI in dezvoltare

O parte din cod a fost scrisa cu asistenta Claude (Anthropic), folosit ca unealta de dezvoltare.
Detalierea — ce anume, ce este original si cum s-a lucrat — este in `docs/authorship.md`,
sectiunea *utilizarea AI*. Declaratia apare si aici pentru ca VI.2 cere lista resurselor externe
folosite in dezvoltare, inclusiv tooling.

## fragmente de cod externe

Niciun fragment de cod copiat din surse externe. Bibliotecile de mai sus sunt folosite prin
API-urile lor publice, ca dependinte declarate.
