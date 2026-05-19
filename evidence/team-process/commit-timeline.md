# cronologia milestone-urilor

extras din `git log --tags --simplify-by-decoration --pretty=format:'%ad %d %s' --date=short`.

| data aprox. | tag | continut |
|-------------|-----|----------|
| martie 2026 | v0.1-mvp | MVP initial: fork DevLife ROG Challenge, main menu, primele scene |
| martie 2026 | v0.3-cinematics | Cinematice ROG (intro + outro), 5 stari cognitive prelucrate vizual |
| martie-aprilie 2026 | v0.5-architecture | Refactor backend: AppState dataclass, fix WHOOP OAuth callback, GAME_MODE routing |
| aprilie 2026 | v0.6-persistence | Persistence SQLite cu WAL, 6 tabele (sessions, interventions, biometric_samples, feedback, apply_fix_audit, consent) |
| aprilie 2026 | v0.7-apply-fix | Apply Fix complet: PatchContract, validator (max 50 linii + shell metacharacters), audit, endpoints preview/confirm/rollback |
| aprilie 2026 | v0.8-i18n | i18n RO/EN module, toggle Settings, persistare localStorage, fallback ro |
| aprilie 2026 | v0.9-tests | 37 teste pytest verzi: classifier, fallback, WS flow, apply fix |
| mai 2026 | v1.0-rc | Release candidate: cleanup root final, README polish, demo playbook, evidence pack initial |
| mai 2026 | v1.1-hardening | Hardening pre-predare: timeout Claude (15s), bounds WS payload, security checklist complet |

## cum se obtine cronologia automata

```bash
git log --tags --simplify-by-decoration --pretty=format:'%ad %d %s' --date=short
```
