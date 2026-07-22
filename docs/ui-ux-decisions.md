# UI/UX: decizii de design

document pentru capitolul III (Interfata UX / UI / CUI, 15 puncte). Aici justificam fiecare alegere vizuala si interactiva.

## principii dirijoare

### 1. Companion, nu dashboard

DevLife nu este un cockpit medical. Este un companion vizual prietenos cu care utilizatorul vrea sa imparta ecranul. Aceasta directie a determinat:
- Personajul Ghost cu personalitate vizibila (tint, aura, screen shake la critic)
- Camera izometrica 2.5D in loc de view 2D simplu
- Paleta "Animal Crossing" calda in loc de neutru sterile
- Plant procedural care creste cu activitatea, ca feedback pozitiv vizual

### 2. Interventie respectuoasa

In DEEP_FOCUS aplicatia tace complet. Devine suportiva cand esti STRESSED si protectiva cand esti FATIGUED, niciodata intrusiva fara motiv.

Concret:
- Cooldown adaptiv (`GhostBrain.should_intervene` in `ghost_brain.py`): 30s default (`GhostBrain.cooldown`), 60s daca utilizatorul a ignorat 3+ interventii la rand, 20s daca a acceptat mai multe decat a ignorat; actiunile riscante sar peste cooldown-ul adaptiv, dar pastreaza un minim de 10s anti-spam
- Gate suplimentar de 8s pe pipeline-ul de analiza dupa fiecare interventie trimisa (`app_state.intervention_cooldown_until`, setat in `loops.py`)
- DEEP_FOCUS: 90% threshold pentru interventie, max 30 tokens raspuns
- Niciodata blocking modal: folosim speech bubble dismiss-able cu ESC
- Toast notifications non-intrusive, dispar singure

### 3. Feedback vizual la fiecare actiune

Fiecare actiune are confirmare vizuala:
- Hover pe interactabil → highlight ring
- [E] prompt deasupra obiectului interactabil
- Click pe app → animatie deschidere + soundManager.playOpen()
- Apply Fix confirmat → flash verde in editor + toast
- Tranzitie stare cognitiva → atmosphere.transition() cu fade colorat

### 4. Doua moduri, o experienta

Hotbar 1-5 pentru schimbare manuala stare permite demonstrare rapida. Cand WHOOP BLE streamuieste date reale, hotbar-ul se dezactiveaza automat (vezi `b7ce5d1`: "WHOOP live mode priority, disable manual override during BLE") pentru a evita coliziuni.

## paleta de culori

| element | culoare | rationale |
|---------|---------|-----------|
| fundal scena | `#1a1a2e` (deep blue-purple) | reduce eye strain pentru sesiuni lungi |
| accent principal | `#e94560` (rosu cald) | culoare de brand DevLife, folosita pentru alerte si accente |
| Ghost RELAXED | albastru-violet pal | calm, neutru |
| Ghost DEEP_FOCUS | verde subtil | focus, productivitate |
| Ghost STRESSED | portocaliu | atentie, dar nu panica |
| Ghost FATIGUED | rosu cald | urgenta, dar nu agresiv |
| Ghost WIRED | galben electric | energie, alerta |
| Plant healthy | verde saturat | feedback pozitiv |
| Plant wilting | maro-galben | semnal de neglijare |

Toate culorile au contrast WCAG AA pentru text peste fundal (verificat cu Chrome DevTools accessibility tools).

## tipografie

| font | utilizare | de ce |
|------|-----------|-------|
| **Fredoka** | titluri, brand, numele starii in HUD | rotund si prietenos, ca un companion |
| **Nunito** | text general, body, etichete | readable, optimizata pentru ecran |
| **JetBrains Mono** | cifrele biometrice din dashboard si InfoPanel | latime fixa: valorile nu sar la fiecare actualizare |
| **monospace** (stack de sistem) | cod in Monaco editor, terminal (xterm cu Menlo / Monaco / Courier New) | pastrare aspect editor |

Fredoka, Nunito si JetBrains Mono (toate SIL Open Font License 1.1) sunt self-hosted ca `.woff2` in `frontend/public/lib/fonts/` si incarcate prin `/lib/fonts/fonts.css`, nu prin CDN: interfata arata identic si fara internet (detalii in `docs/assets-compliance.md`). Singura exceptie e pagina standalone `dashboard.html`, care inca incarca JetBrains Mono si Inter din Google Fonts CDN; jocul propriu-zis nu depinde de ea.

## componente UI

### HUD (top-right)

Date primare biometrice:
- HR mare (numeric) + grafic ECG procedural mic
- HRV cu trend (sageata up/down/stable)
- Recovery, Strain, Sleep Performance: bare progresive
- CQI (Code Quality Index): derivat, 0-100
- Autonomic Balance: raport simpatic/parasimpatic

Decizie: HUD-ul este intotdeauna vizibil, dar mic. Nu inghite ecranul.

### Speech bubble Ghost

- Pozitionata deasupra Ghost-ului in lumea izometrica
- Maximum 2-3 propozitii (configurabil per stare)
- Butoane contextuale (Save Draft / Do It Anyway / Remind Later pentru critic; Thanks / Not Now pentru normal; Apply Fix / Show More / Not Now cand exista code_suggestion)
- Tail orientata catre Ghost
- Dismiss cu ESC sau click oriunde

### Hotbar (bottom)

5 chei mari (1-5) cu iconite pentru stari cognitive:
1. RELAXED (icon: leaf)
2. DEEP_FOCUS (icon: target)
3. STRESSED (icon: cloud)
4. FATIGUED (icon: moon)
5. WIRED (icon: bolt)

State activ are border luminos + tint. Disable cand BLE este conectat (vizual: opacitate scazuta + cursor blocked).

### Apply Fix preview dialog

- Layout side-by-side: stanga "Inainte" (cod original), dreapta "Dupa" (cod propus)
- Sintaxa highlight pe ambele (Monaco)
- Footer: rationale Claude + butoane "Confirma" / "Anuleaza"
- Daca exista diferenta de linii: liniile schimbate sunt evidentiate (galben adaugat, rosu sters)

### Toast notifications

5 tipuri (config in `frontend/src/hud/ToastSystem.js`):
- `info` (albastru): informatii generale
- `state` (purple): schimbare stare cognitiva
- `warning` (portocaliu): risc detectat
- `ghost` (turcoaz): actiune Ghost
- `achievement` (auriu): gamificare usoara

Pozitionate top-right, stack vertical, auto-dismiss dupa 3-5s.

## responsivitate

Desktop-first este o decizie, nu o scapare: DevLife e un companion de coding, deci ecranul tinta e acelasi pe care stau IDE-ul si terminalul, adica un laptop sau un monitor extern. CSS-ul nu impune un min-width global pe pagina; latimile minime sunt doar la nivel de componenta (bula de dialog a Ghost-ului la 300px in `Ghost.js`, meniul principal la 240px in `MainMenu.js`), iar layout pentru mobil nu exista si nu e planificat.

- `window.addEventListener('resize')` reseteaza dimensiunile PixiJS si recalculeaza camera offset
- HUD overlay foloseste CSS positioning (DOM, nu canvas), deci se adapteaza automat la rezolutia ecranului
- Toate dialog-urile sunt flex-based si se aseaza dupa spatiul disponibil
- `devicePixelRatio` luat in considerare pentru ecrane retina (`resolution: window.devicePixelRatio`)

Testat pe:
- MacBook Air M1 (13" retina)
- Monitor extern 1920x1080
- Browser zoom 75% - 150%

## sound design

Toate sunetele sintetizate procedural prin Web Audio API (`audio/SoundManager.js`). Niciun fisier audio extern (vezi `docs/assets-compliance.md`).

Tipuri:
- `playOpen()`: app overlay deschis (fade in tone)
- `playClose()`: app overlay inchis (fade out tone)
- `playClick()`: buton meniu (short tick)
- `playGhostSpeak()`: interventie normala (soft chime)
- `playGhostAlert()`: interventie critic (alarmant, mai prelung)
- `setState(state)`: ambient drone adaptat starii (DEEP_FOCUS: continuu calm; STRESSED: vibrato; etc.)

Volum master controlabil din Settings, persistent in localStorage.

## animatii si tranzitii

- **Camera follow**: smooth lerp (`camLerp = 0.07 * delta`) pentru a evita motion sickness
- **Atmosphere transitions**: fade peste 800ms intre starile cognitive
- **Plant growth**: animatie de scale 1.5s la fiecare `plant_update` (debounced)
- **Ghost trail**: particule cu lifespan variabil, intensitate per stare
- **Screen shake**: doar pe interventii `critical`, max 200ms, max 8px amplitude, sub pragul motion-sensitivity
- **Tranzitii scene** (Room → Town → Cafe → Cowork): fade-to-black 800ms cu `TransitionOverlay`

## internationalizare (i18n)

- Toggle RO/EN in Settings → Limba
- Default RO (proiect romanesc)
- Persistat in `localStorage[devlife_lang]`
- Toate string-urile critical path trec prin `i18n.t(key)`
- Fallback la RO daca cheia lipseste in EN
- Modulul accepta `onChange(fn)` listeners, deci UI poate reactiona la schimbare fara reload

Fisiere:
- `frontend/src/i18n/ro.json`: sursa de adevar
- `frontend/src/i18n/en.json`: traducere
- `frontend/src/i18n/index.js`: engine cu format `{var}` placeholders

## accesibilitate

- **Keyboard navigation**: WASD pentru miscare, E pentru interact, 1-5 pentru stari, ESC pentru dismiss/close, TAB pentru dashboard overlay
- **No flashing < 3Hz**: niciun element nu palpaie sub pragul WCAG (epilepsie)
- **High contrast text**: text alb pe fundal inchis, alb pe accent rosu, contrast > 4.5:1
- **Sound mutable**: Settings → Sound toggle (persistat)
- **Screen reader friendly**: butoanele din speech bubble sunt elemente `<button>` accesibile, nu doar canvas-painted

## cum sustinem aceste decizii vizual

Vezi `evidence/screenshots/` pentru capturi efective (lista in `evidence/screenshots/README.md`).
