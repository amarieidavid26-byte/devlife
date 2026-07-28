# positioning: analiza pietei

document detaliat pentru criteriul I.1 (Analiza pietei, 10 puncte).

## problema

Performanta cognitiva a dezvoltatorilor este influentata direct de starea fiziologica. Nu e o intuitie de-a noastra, exista literatura clinica in spate:

- **Yerkes-Dodson law (1908)**: performanta cognitiva este o curba in U inversat. Prea putin arousal (oboseala, plictiseala) duce la decizii proaste; prea mult arousal (stres, frica) la fel. Optimum-ul este la mijloc.
- **Peifer et al. 2014**: starea de "flow" coreleaza cu activitate parasimpatica crescuta (componenta HF a HRV) si o activare simpatica moderata, de tip U inversat. Limite pe care le asumam explicit: esantion mic (22 subiecti, doar barbati), masurat sub stresor de laborator — deci o directie utila, nu un "profil biometric" universal.
- **McKenna, Dickinson, Orff & Drummond, 2007** ([J Sleep Research, PMID 17716272](https://pubmed.ncbi.nlm.nih.gov/17716272/)): dupa o singura noapte de privare de somn, preferinta pentru risc se muta in functie de framing — subiectii devin **mai dispusi sa riste pentru un castig potential** si mai prudenti in fata unei pierderi potentiale. (Preferinta pentru ambiguitate ramane in mare parte neafectata — nu extindem concluzia dincolo de ce arata studiul.) Relevanta pentru noi: la 2 AM, "mai fac un fix si merge" este exact un frame de castig, iar comenzile ireversibile (`git push --force`, `rm -rf`, `DROP TABLE`) se executa tocmai in acest registru.
- **Pragul HRV 0.75** din `biometric_engine.py::classify()`: sub 0.75 din baseline-ul personal, motorul estimeaza stres 1.8/3.0. Pragul e o calibrare aleasa de noi empiric, in linie cu directia literaturii de mai sus, nu o valoare preluata dintr-un studiu publicat.

Manifestari concrete la dezvoltatori:
- `git push --force` pe productie la 2 AM
- `rm -rf` rulat dintr-un director gresit
- `DROP TABLE` pe baza de date live in loc de staging
- Code review aprobat fara sa fie citit
- Bug-uri introduse in faza "ar trebui sa ma duc la culcare, dar mai fac un fix"

## solutii existente: analiza individuala

### 1. RescueTime (productivity tracker)

- **Ce face**: monitorizeaza timpul petrecut pe aplicatii si site-uri, genereaza rapoarte de productivitate.
- **Ce nu face**: nu citeste biometrice si nu intelege contextul cognitiv; ruleaza pasiv (post-mortem analytics, nu prevention).
- **Cui se adreseaza**: cunoscatorii care vor sa-si auditeze obiceiurile.
- **Pret**: $9/luna premium.
- **Diferenta vs DevLife**: RescueTime spune "ai pierdut 2h pe Reddit"; DevLife spune "biometricele tale sunt compromise, nu da push acum".

### 2. Pomodoro apps (Forest, Be Focused, etc.)

- **Ce face**: timer 25 min focus + 5 min pauza, gamificare usoara (creste un copac).
- **Ce nu face**: nu stie daca utilizatorul este chiar concentrat sau doar fixeaza ecranul; presupune ca "timpul" e suficient.
- **Cui se adreseaza**: persoane cu probleme de focus.
- **Pret**: gratis cu IAP $2-5.
- **Diferenta vs DevLife**: Pomodoro e un timer mecanic; DevLife reactioneaza la corp.

### 3. Oura Ring / Garmin Connect / Fitbit (wearable companions)

- **Ce face**: tracking sanatate complet (somn, HRV, recovery, training load).
- **Ce nu face**: dashboard separat, nu integrat in fluxul de cod; nu face interventii contextuale si nu se conecteaza la editor.
- **Cui se adreseaza**: utilizatori health-conscious in general.
- **Pret**: $150-400 hardware + $5-10/luna app.
- **Diferenta vs DevLife**: Oura iti spune dimineata "ai HRV scazut"; DevLife iti spune la 2 AM "HRV scazut, nu da push acum".

### 4. GitHub Copilot / Cursor / Codeium (AI code assistants)

- **Ce face**: sugereaza cod inline pe baza contextului, autocomplete avansat.
- **Ce nu face**: nu stie nimic despre starea fizica a utilizatorului; nu blocheaza actiuni periculoase si nu face audit.
- **Cui se adreseaza**: orice dezvoltator.
- **Pret**: $10-20/luna.
- **Diferenta vs DevLife**: Copilot iti completeaza cod; DevLife iti spune cand sa NU scrii cod.

### 5. WHOOP app (biometric companion)

- **Ce face**: dashboard biometric complet (recovery, strain, sleep, HRV trends).
- **Ce nu face**: nu intervine in fluxul de lucru si nu intelege contextul de cod; nu blocheaza nimic.
- **Cui se adreseaza**: atleti si quantified-self enthusiasts.
- **Pret**: $25-30/luna abonament + hardware.
- **Diferenta vs DevLife**: WHOOP iti arata date; DevLife actioneaza pe baza lor.

### 6. RescueTime FocusTime + Headspace Work

- **Ce face**: blocheaza site-uri distractive si ofera meditatii ghidate.
- **Ce nu face**: blocajul e setat manual, nu adaptat starii fizice.
- **Diferenta vs DevLife**: blocaj manual vs blocaj contextual.

## tabel sinteza competitor

| categorie | exemple | biometrice | blocheaza activ | context cod | pret |
|-----------|---------|-----------|-----------------|-------------|------|
| Productivity trackers | RescueTime, Toggl | ❌ | ❌ | ❌ | $9-12/luna |
| Pomodoro timers | Forest, Be Focused | ❌ | partial (timer) | ❌ | gratis-$5 |
| Wearables apps | Oura, Garmin, Fitbit, WHOOP | ✅ | ❌ | ❌ | $5-30/luna + hardware |
| AI code assistants | Copilot, Cursor, Codeium | ❌ | ❌ | ✅ | $10-20/luna |
| **DevLife** | (acest proiect) | ✅ | ✅ | ✅ | open source |

## elemente distinctive (USP)

### 1. Fatigue Firewall: blocare activa

Singura aplicatie analizata care **blocheaza** comenzi periculoase pe baza starii fiziologice. Detectare instant prin 11 regex patterns (latenta < 1ms), fara apel API:
- `rm -rf`, `git push --force`, `DROP TABLE`, `chmod 777`, `sudo rm`, `git reset --hard`, `DELETE FROM`, `docker rm -f`, `npm publish`, `env` (dump secrete), `force push`.

Cand starea cognitiva este FATIGUED, in loc de un avertisment generic, Ghost-ul afiseaza biometricele exacte ale utilizatorului ca rationale: *"FATIGUE FIREWALL -- HRV 28ms, stress 1.8/3.0. 'force push' este ireversibil. Salveaza-ti munca intai."*

Pattern-ul asta, datele tale personale folosite ca argument pentru o decizie, nu l-am gasit in niciun produs comercial analizat.

### 2. Pipeline biometric → cod

DevLife conecteaza date fiziologice direct la actiuni concrete in editorul de cod, in cinci moduri:
- **CodeEditor** (Monaco): detecteaza bug-uri, propune fix-uri prin Apply Fix
- **Terminal**: detecteaza patternuri risky instant; intervine contextual
- **Browser**: detecteaza rabbit holes (Reddit, YouTube), sugereaza revenirea
- **Notes**: analizeaza tonul (anxios, planificat, brainstorm)
- **Chat**: conversatie cu Ghost adaptata starii cognitive

Niciuna dintre aplicatiile analizate nu face acest cross-over.

### 3. Apply Fix cu validator + audit + rollback

Patch-urile propuse de AI **nu sunt aplicate automat**. Trec prin:
1. **Validator Pydantic**: max 500 linii, fara metacaractere shell, rationale obligatoriu
2. **Preview UI**: dialog side-by-side "Inainte/Dupa" cu diff vizual
3. **Confirmare explicita**: utilizatorul da click "Confirma" sau "Anuleaza"
4. **Audit log**: fiecare actiune (preview, confirm, rollback, reject) inscrisa in `apply_fix_audit` (SQLite)
5. **Rollback**: pre-image stocat, revert cu un click

Lantul asta de safety e ce cer mediile enterprise cu SOC compliance. Pentru un proiect studentesc pare mult, dar un produs care propune modificari de cod nu are voie sa sara peste el.

## fezabilitate publicul tinta

### primar
- **Dezvoltatori solo / freelanceri** care lucreaza ore lungi fara supervizare.
- **SRE / DevOps on-call**, cu acces la productie la ore tarzii.
- **Studenti la informatica** in perioade de proiect sau examen.

Ca ordin de marime, estimam zeci de milioane de dezvoltatori la nivel global si cateva milioane de ingineri on-call. Sunt aproximari proprii: nu am gasit o sursa publica verificabila pe care sa o putem cita, asa ca nu le prezentam drept cifre de piata masurate.

### secundar
- **Echipe mici** unde CTO-ul vrea safety net pentru incidente la 3 AM.
- **Cercetatori** in domeniul biometricii aplicate la work performance.
- **Comunitatea Quantified Self**, deja echipata cu wearable-uri; nu o dimensionam numeric.

### barierele de adoptie
- **Wearable necesar** pentru experienta completa (WHOOP, Garmin, etc.). Mitigat prin Chrome Web Bluetooth + DEMO_OFFLINE pentru evaluare.
- **Setup OAuth WHOOP** initial: pas explicit in `install-runbook.md`.

## roadmap fezabilitate

Termen scurt (3 luni dupa lansare):
- Migrare TypeScript pentru frontend (siguranta tip)
- Integrare Garmin / Apple Watch ca alternative la WHOOP
- Preset-uri biometrice pentru profile speciale (sportivi, persoane cu apnee)
- Extindere Fatigue Firewall (AWS CLI patterns, Kubernetes, Terraform)
- Apply Fix multi-file

Termen mediu (6-12 luni):
- Versiune mobile companion (iOS/Android) cu push notifications
- Extensie JetBrains (cea de VS Code exista deja: `vscode-extension/`, DevLife Bridge)
- Cloud sync optional (E2E encryption)
- Team mode: managerul vede o imagine agregata a starilor echipei (cu consimtamant)

Termen lung (1-2 ani):
- Modele ML personalizate per utilizator
- Integrare cu calendar (Ghost stie ca ai meeting in 30 min)
- Context biometric in code review

Out of scope (decis explicit):
- Multiplayer / social features: incompatibil cu safety-first focus
- Monetizare prin date, incompatibila cu principiile de privacy
- Gamification cu leaderboard pe biometrice (psihologic nesanatos)
