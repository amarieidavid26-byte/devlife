# DevLife Bridge (extensie VS Code)

Extensia scoate DevLife din joc: streameaza contextul REAL din editorul tau catre acelasi
backend, pe acelasi protocol WebSocket, deci ghost-ul analizeaza codul pe care il scrii
efectiv in VS Code.

- **status bar**: pulsul live + starea cognitiva (`❤ 72 DEEP_FOCUS ⌨`)
- **interventii**: apar ca notificari VS Code cu butoanele ghost-ului (Apply Fix / Not Now...);
  raspunsul tau se intoarce in bucla de invatare a ghost-ului
- **Apply Fix aplica pe bune**: diff side-by-side cu propunerea ghost-ului, apoi Apply
  rescrie fisierul din editor. Acelasi contract validat + auditat ca in joc
  (`/api/apply-fix/preview` → `confirm`, cu Revert si Cmd+Z). Limite: fisiere de maximum
  500 de linii si 50k de caractere
- cat timp esti conectat, textul complet al fisierului activ (max 50k de caractere, orice
  tip de fisier de pe disc) este trimis backend-ului pentru analiza ghost-ului; fisierele
  cu secrete evidente (`.env*`, `*.pem`, `id_rsa*`, `*credentials*`) si documentele care
  nu sunt fisiere pe disc nu se trimit
- ritmul de tastare din editor alimenteaza clasificatorul de stres/oboseala: doar intervale
  si categorii, **niciodata continutul tastelor**
- cand esti FATIGUED, ghost-ul devine mai precaut cu interventiile pe codul tau;
  avertismentul instant pentru comenzi riscante (`git push` etc.) exista doar in
  terminalul DevLife din joc

## instalare (dev)

```bash
cd vscode-extension
npm install
```

apoi in VS Code: deschide folderul `vscode-extension`, apasa **F5** (Run Extension).
Backend-ul DevLife trebuie sa ruleze local (`./scripts/dev.sh`).

## pachet .vsix (optional)

```bash
npx @vscode/vsce package
code --install-extension devlife-bridge-0.1.0.vsix
```

## setari

- `devlife.backendUrl`: URL-ul WS al backend-ului (default `ws://localhost:8000/ws`)
- comanda `DevLife: Reconnect` din Command Palette forteaza reconectarea
