# resurse externe — conformitate

## assets grafice

| resursa | sursa | licenta | cale |
|---------|-------|---------|------|
| Furniture Kit 2.0 (obiecte izometrice) | [Kenney.nl](https://kenney.nl) | CC0 1.0 — domeniu public | `public/assets/` |

dovada: `public/assets/License.txt` — CC0 confirmat.

## fonturi

| font | sursa | licenta |
|------|-------|---------|
| Fredoka | [Google Fonts](https://fonts.google.com/specimen/Fredoka) | SIL OFL 1.1 |
| Nunito | [Google Fonts](https://fonts.google.com/specimen/Nunito) | SIL OFL 1.1 |

incarcate via `frontend/index.html` prin CDN Google Fonts.

## audio

- **SoundManager.js** — toate sunetele sunt sintetizate procedural prin Web Audio API. niciun fisier audio extern. vezi headerul `frontend/src/audio/SoundManager.js`: *"all sounds are synthesized with web audio api — no external audio files needed"*.
- **devlife.mp3** — fisier sters. continea muzica cu drepturi de autor (provenienta necunoscuta). speaker-ul din joc ramane silentios fara fisier ambient.

## AI / API

| serviciu | utilizare | declaratie |
|----------|-----------|------------|
| Claude API (Anthropic) | analiza cod, ghost brain, interventii | declarat in `README.md` sectiunea tech stack |
| WHOOP API | date biometrice (OAuth2) | declarat in `README.md` sectiunea tech stack |

## biblioteci open source (principale)

| librarie | licenta |
|----------|---------|
| FastAPI | MIT |
| PixiJS | MIT |
| Pydantic | MIT |
| Uvicorn | BSD |
| Anthropic Python SDK | MIT |
| Howler.js | MIT |
| Vite | MIT |
| slowapi | MIT |
| python-dotenv | BSD |

lista completa in `requirements.txt` (Python) si `frontend/package.json` (Node).

## cod sursa extern

niciun fragment de cod copiat din surse externe nedeclarate. librarii folosite sunt declarate mai sus.
