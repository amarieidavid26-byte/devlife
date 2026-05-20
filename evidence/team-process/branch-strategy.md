# strategie de branching — DevLife

## conventii folosite

### branch `main`
- branch-ul principal — codul stabil si testat
- fiecare push pe `main` declanseaza deploy-ul Railway (CI/CD automat)
- nu se accepta cod care nu trece teste

### branch `infoeducatie-hardening`
- branch dedicat pentru hardening-ul pre-predare (timeout Claude, bounds WS, security checklist)
- merged in main dupa verificare manuala + 37 teste verzi

## conventii mesaje commit

Mesajele urmeaza un pattern simplu:
- prefix `tNN` pentru task-urile structurale planificate (vezi `docs/rubric-matrix.md`)
- mesaj imperativ scurt: ce schimba commit-ul
- daca e nevoie, body cu rationale-ul

Exemple:
```
t02 fix whoop callback, port env, appstate, game mode imports + tests
t05 persistence layer sqlite
t07 apply fix backend - contract, validator, audit, endpoints + test
t09 i18n module ro/en toggle
hardening: timeout pe Claude API + bounds explicite pe WS payload
```

## merge-uri si rebase

- merge commit-uri vizibile in `git-graph.txt` (de ex. "Merge branch 'main' of github.com/amarieidavid26-byte/devlife")
- nu folosim rebase peste merge-uri publicate
- conflicte rezolvate manual cu pair-programming pentru zonele atinse de ambii autori

## taguri

Vezi `README.md` — 9 tag-uri semantice marcheaza stari intermediare reproductibile.

## politici

- `.env` si secretele **nu** se commiteaza (vezi `.gitignore`)
- `.env.example` se mentine actualizat ca template
- `__pycache__/` si `.DS_Store` nu se commiteaza (sunt insa filtrate prin gitignore intern)
- credentialele WHOOP si Claude API se introduc local in `.env`, in productie in Railway dashboard
