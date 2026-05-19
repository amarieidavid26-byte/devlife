# desk code runner

editorul de cod de pe biroul utilizatorului ruleaza efectiv codul, nu doar afiseaza.

## ce face

- Run / Stop in bara de sus a editorului
- panou de iesire jos cu doua tab-uri: `intrare` (stdin editabil) si `iesire` (stdout/stderr)
- timp de executie si cod de iesire afisate ca badge-uri
- timeout 5s pentru bucle infinite — worker-ul e terminat fortat
- Stop opreste manual orice rulare in curs
- erorile la runtime sunt trimise inapoi la ghost prin ws → ghost propune fix → Apply Fix → preview diff existent → swap cod (toata bucla reutilizeaza pipeline-ul deja existent)

## ce limbi ruleaza

- **Python 3** — real, prin Pyodide (~8MB wasm, descarcat odata, apoi cache browser)
- **JavaScript** — prin Web Worker nativ, fara dependinte

GO si C++ raman ca tab-uri vizibile pentru review AI (ghost analizeaza cod static), dar butonul Run e ascuns si apare hint-ul `Doar review AI — comuta pe PY/JS pentru a rula`.

## de ce nu C++/Go

C++ ar avea nevoie de Docker (Piston) sau o pre-compilare emscripten cu wasm pre-generat. Docker introduce un punct de esec la demo (juriul ar trebui sa aiba Docker pornit local) si rupe povestea `DEMO_OFFLINE`. Pre-compilarea limiteaza editarea — daca juriul schimba codul si apasa Run, nu mai functioneaza, ceea ce ar fi mai rau decat un Run dezactivat onest.

Go in browser inseamna TinyGo cu stdlib incompleta (fara `net/http`, `encoding/json` partial), iar pentru un context de olimpiada romaneasca asta s-ar vedea imediat.

documentat in `docs/development-plan.md` ca roadmap.

## arhitectura

```
              CodeEditor.js (frontend)
   ┌─────────────────────────────────────────────┐
   │ top bar:  tab | PY JS GO C++ | ▶ Run ■ Stop │
   │ monaco editor                                │
   │ panou: [intrare] [iesire]   exit • 142ms    │
   └──────┬────────────────────────┬──────────────┘
          │ lang=python            │ lang=javascript
          ▼                         ▼
   PythonRunner.js          JsRunner.js
   ├ pythonWorker.js        ├ jsWorker.js
   │ (importScripts          │ (new Function +
   │  pyodide.js,             │  AsyncFunction
   │  sys.stdout/stderr/     │  wrap, console.*
   │  stdin redirectate      │  capturat)
   │  catre io.StringIO)     │
   └─────────────────────────┘
          │ {stdout, stderr, exit, ms}
          ▼
   CodeEditor.displayRunResult(result)
          │
          │ daca stderr non-gol si exit != 130 (SIGINT):
          ▼
   socket.sendRunError(code, stderr, lang)  ──ws──>
          │                                          │
          ▼                                          ▼
                                          server.py: run_error branch
                                          → content_analyzer.analyze(
                                              "code", code,
                                              extra_context=f"Runtime error:\n{err}",
                                              language=lang)
                                          → brain.process(...)
                                          → await broadcast(intervention)
                                          ▼
                                  Ghost speech bubble (cu Apply Fix)
                                  → showPatchPreview() — diff Before/After
                                  → confirm → replaceContent() — swap cod
```

singura branch noua in backend e `elif data.get("type") == "run_error":` in `server.py`. Restul pipeline-ului (apply-fix preview, confirmare, validare PatchContract, audit log) e cel existent.

## securitate

- **JavaScript** ruleaza intr-un Web Worker, fara acces la DOM, fara `fetch` configurat, in propriul thread. Bucle infinite → 5s timeout → `worker.terminate()`.
- **Python** ruleaza intr-un Web Worker care incarca Pyodide. Pyodide e wasm sandboxat de browser. Nu poate accesa file system, nu are network (decat ce expunem explicit), e izolat de pagina principala. Bucle infinite → 5s timeout → terminate worker; la urmatorul Run se respawn.
- **Inputuri WS** — `run_error` are cap de 50000 caractere atat pe `code` cat si pe `error` (aliniat cu `WS_MAX_CONTENT_CHARS` din branch-ul de hardening). Limba e validata ca string scurt.
- **Stop button** trimite `exit=130` (SIGINT-style), iar `displayRunResult` NU notifica ghost pentru exit=130 — utilizatorul a oprit intentionat, nu vrem zgomot.

## throttling pentru run_error

`CodeEditor.displayRunResult` urmareste cea mai recenta combinatie `(language, error_prefix)` si nu retrimite aceeasi eroare in mai putin de 5s. Asta evita sa generezi 10 interventii pe rand cand utilizatorul apasa Run repetat pe acelasi bug.

## fisiere

frontend:
- `frontend/src/apps/CodeEditor.js` — UI (Run/Stop, panou iesire, integrare runner-e)
- `frontend/src/apps/runners/JsRunner.js` + `jsWorker.js` — runner JS
- `frontend/src/apps/runners/PythonRunner.js` + `pythonWorker.js` — runner Python
- `frontend/src/network/WebSocket.js` — `sendRunError(code, error, language)`
- `frontend/src/i18n/ro.json` + `en.json` — chei `runner.*`
- `frontend/public/lib/pyodide/` — descarcat de `scripts/setup-pyodide.sh`, gitignored

backend:
- `server.py` — branch `elif data.get("type") == "run_error":` in `websocket_endpoint`
- `content_analyzer.py` — extensie mica la `APP_PROMPTS["code"]` pentru runtime errors

teste:
- `tests/test_run_error_routing.py` — verifica routing-ul end-to-end cu mock pe Anthropic

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
4. dupa ~2s ghost apare cu mesaj: "f() crapa pe None — protejaza cu `if name is None: return ''`"
5. apasa Apply Fix → dialog `showPatchPreview` cu diff Before/After (UI existent)
6. apasa Confirma → cod inlocuit, flash verde in editor (UI existent), toast `Fix aplicat`
7. apasa Run din nou → fara erori, executie reusita

asta e momentul de demo pentru sectiunea III.2 (UX) si dovada vie pentru II.1 (arhitectura — toate piesele se aliniaza).
