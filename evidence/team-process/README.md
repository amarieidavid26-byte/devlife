# procesul de lucru in echipa — DevLife

dovada pentru capitolul V (Lucrul in echipa, 10 puncte) si II.7 (Folosirea unui sistem de versionare, 5 puncte).

## artefacte in acest folder

| fisier | continut |
|--------|----------|
| `git-graph.txt` | log complet cu graph al ramurilor (`git log --graph --all`) |
| `contributor-stats.md` | distributia commits-urilor + arii de responsabilitate per autor |
| `commit-timeline.md` | timeline-ul cronologic al milestoane-lor cheie |
| `branch-strategy.md` | conventiile de branching folosite + rationale |

## tags principale (stari intermediare)

| tag | commit | reprezentare |
|-----|--------|--------------|
| `v0.1-mvp` | d88f077 | MVP initial: DevLife cu main menu |
| `v0.3-cinematics` | 865e93d | Cinematice: intro main menu, capitole demo, outro credits |
| `v0.5-architecture` | 6b9d816 | T02: refactor backend — AppState centralizat, fix WHOOP callback |
| `v0.6-persistence` | 15d81cf | T05: persistence SQLite cu sessions, interventions, audit |
| `v0.7-apply-fix` | 4a509ff | T07: Apply Fix backend complet (contract, validator, audit, endpoints) |
| `v0.8-i18n` | dce9aae | T09: i18n module RO/EN cu toggle |
| `v0.9-tests` | 028cd6a | T08: 37 teste pytest verzi |
| `v1.0-rc` | a4ffc7c | Release candidate InfoEducatie 2026 |
| `v1.1-hardening` | 48e1010 | Hardening pre-predare: timeout Claude + bounds WS payload |

reproductibile cu:
```bash
git tag -l                  # lista tag-uri
git show v0.7-apply-fix     # detalii commit
git log v0.6..v0.7          # commit-uri intre milestone-uri
```

## comunicare echipa

- **GitHub repo**: `github.com/amarieidavid26-byte/devlife` — review prin commit history publica
- **Pair-programming sessions**: weekly sync (face-to-face) — discutii de arhitectura inainte de implementare
- **AI-assisted coding**: declarat explicit in `docs/authorship.md` — Claude AI folosit ca asistent in pair programming, toate deciziile umane

## decizii arhitecturale documentate

Vezi `docs/rubric-matrix.md` pentru maparea fiecarei sectiuni a rubricii cu artefactele concrete din repo. Aceasta matrice a fost folosita ca plan de dezvoltare in tot timpul lucrarii (criteriul I.2).
