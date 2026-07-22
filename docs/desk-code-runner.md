# desk code runner

editorul de cod de pe biroul utilizatorului ruleaza efectiv codul, nu doar afiseaza.

## ce face

- Run / Stop in bara de sus a editorului
- panou de iesire jos cu doua tab-uri: `intrare` (stdin editabil) si `iesire` (stdout/stderr)
- timp de executie si cod de iesire afisate ca badge-uri
- timeout 5s pentru bucle infinite; worker-ul e terminat fortat (exit 124)
- Stop opreste manual orice rulare in curs (exit 130)
- erorile la runtime sunt trimise inapoi la ghost prin ws → ghost propune fix → Apply Fix → preview diff existent → swap cod (toata bucla reutilizeaza pipeline-ul deja existent)

## ce limbi ruleaza

- **Python 3**: real, prin Pyodide (nucleu wasm de ~10MB, descarcat o data de `scripts/setup-pyodide.sh` si servit local, apoi cache in browser)
- **JavaScript**: Web Worker nativ, fara dependinte
- **C si C++**: JSCPP, un interpretor C++ scris in JS pur, tot intr-un Web Worker; suporta cin/cout/printf, clase, pointeri si array-uri C, dar nu are containerele STL (`<vector>`, `<map>`)

fisierele in orice alt limbaj raman doar pentru review AI: ghost analizeaza codul static, butonul Run se ascunde si in locul lui apare un hint ca fisierul nu se poate rula.

## de ce nu Go (si cum a intrat C++)

C++ parea la fel de blocat la inceput: Docker (Piston) ar fi introdus un punct de esec la demo (juriul ar trebui sa aiba Docker pornit local) si ar fi rupt povestea `DEMO_OFFLINE`, iar pre-compilarea emscripten ar fi limitat editarea. Daca juriul schimba codul si apasa Run, nu mai functioneaza, ceea ce ar fi mai rau decat un Run dezactivat onest. JSCPP a rezolvat dilema: fiind interpretor, nu compilator, codul editat pe loc ruleaza direct, offline, fara servicii externe. Pretul e lipsa STL-ului, acceptabil pentru fragmente de demo.

Go in browser inseamna TinyGo cu stdlib incompleta (fara `net/http`, `encoding/json` partial), iar pentru un context de olimpiada romaneasca asta s-ar vedea imediat. Ramane review-only.

## arhitectura

```
              CodeEditor.js (frontend)
   ┌─────────────────────────────────────────────┐
   │ top bar:  file tabs | ▶ Run ■ Stop          │
   │ monaco editor                                │
   │ panou: [intrare] [iesire]   exit • 142ms    │
   └───┬─────────────────┬────────────────┬──────┘
       │ python           │ javascript     │ c / c++
       ▼                  ▼                ▼
   PythonRunner.js    JsRunner.js      CppRunner.js
   ├ pythonWorker.js  ├ jsWorker.js    ├ cppWorker.js
   │ (importScripts    │ (new Function  │ (JSCPP.run,
   │  pyodide.js,      │  + AsyncFunc   │  stdio.write
   │  stdout/stderr/   │  wrap,         │  capturat)
   │  stdin catre      │  console.*     │
   │  io.StringIO)     │  capturat)     │
   └──────────────────────────────────────┘
          │ {stdout, stderr, exit, ms}
          ▼
   CodeEditor.displayRunResult(result)
          │
          │ daca stderr non-gol si exit != 130 (SIGINT):
          ▼
   socket.sendRunError(code, stderr, lang)  ──ws──>
          │                                          │
          ▼                                          ▼
                                          ws_game.py: handler run_error
                                          → content_analyzer.analyze(
                                              "code", code,
                                              extra_context=f"Runtime error:\n{err}",
                                              language=lang)
                                          → brain.process(...)
                                          → await broadcast(intervention)
                                          ▼
                                  Ghost speech bubble (cu Apply Fix)
                                  → showPatchPreview(): diff Before/After
                                  → confirm → replaceContent(): swap cod
```

in backend, `run_error` e un handler dedicat (`_ws_run_error`) inregistrat in dispatch-ul `WS_HANDLERS` din `ws_game.py`; `server.py` doar importa mapa. Restul pipeline-ului (apply-fix preview, confirmare, validare PatchContract, audit log) e cel existent.

## securitate

- JavaScript ruleaza intr-un Web Worker: fara acces la DOM, fara `fetch` configurat, in propriul thread. Bucle infinite → 5s timeout → `worker.terminate()`.
- Python ruleaza intr-un Web Worker care incarca Pyodide, wasm sandboxat de browser. Nu poate accesa file system, nu are network (decat ce expunem explicit), e izolat de pagina principala. La timeout worker-ul e terminat si se respawn la urmatorul Run.
- C++ mosteneste sandbox-ul worker-ului (JSCPP e JS pur, nu cod nativ) si are propriul `maxTimeout` de 5000ms, dublat de guard-ul extern din `CppRunner`.
- Inputuri WS: `run_error` taie `code` si `error` la 50000 de caractere (aliniat cu `WS_MAX_CONTENT_CHARS` din `runtime.py`). Limba e validata ca string scurt.
- Butonul Stop trimite `exit=130` (stil SIGINT), iar `displayRunResult` NU notifica ghost pentru exit=130: utilizatorul a oprit intentionat, nu vrem zgomot.

## throttling pentru run_error

`CodeEditor.displayRunResult` urmareste cea mai recenta combinatie (limbaj, primele 200 caractere din eroare) si nu retrimite aceeasi eroare in mai putin de 5s. Asta evita sa generezi 10 interventii pe rand cand utilizatorul apasa Run repetat pe acelasi bug.

## fisiere

frontend:
- `frontend/src/apps/CodeEditor.js`: UI (Run/Stop, panou iesire, integrare runner-e)
- `frontend/src/apps/runners/JsRunner.js` + `jsWorker.js`: runner JS
- `frontend/src/apps/runners/PythonRunner.js` + `pythonWorker.js`: runner Python
- `frontend/src/apps/runners/CppRunner.js` + `cppWorker.js`: runner C/C++ (JSCPP)
- `frontend/src/network/WebSocket.js`: `sendRunError(code, error, language)`
- `frontend/src/i18n/ro.json` + `en.json`: chei `runner.*`
- `frontend/public/lib/pyodide/`: descarcat de `scripts/setup-pyodide.sh`, gitignored

backend:
- `ws_game.py`: handler `_ws_run_error` in dispatch-ul `WS_HANDLERS`
- `content_analyzer.py`: `analyze()` primeste `extra_context` cu eroarea de runtime pentru promptul de `code`

teste:
- `tests/test_run_error_routing.py`: verifica routing-ul end-to-end cu mock pe Anthropic

## demo flow (60s)

1. utilizator deschide laptopul de pe birou, tab Python
2. scrie:
   ```python
   def greet(name):
       return name.upper()
   greet(None)
   ```
3. apasa Run → panou iesire arata in rosu:
   ```
   AttributeError: 'NoneType' object has no attribute 'upper'
   ```
4. dupa ~2s ghost apare cu mesaj: "greet() crapa pe None, protejaza cu `if name is None: return ''`"
5. apasa Apply Fix → dialog `showPatchPreview` cu diff Before/After (UI existent)
6. apasa Confirma → cod inlocuit, flash verde in editor (UI existent), toast `Fix aplicat`
7. apasa Run din nou → fara erori, executie reusita

asta e momentul de demo pentru sectiunea III.2 (UX) si dovada vie pentru II.1 (arhitectura: toate piesele se aliniaza).
