# DevLife Bridge — extensie VS Code

DevLife nu mai e doar un joc: extensia streameaza contextul REAL din editorul tau catre
acelasi backend (acelasi protocol WebSocket ca jocul), deci ghost-ul analizeaza codul pe
care il scrii efectiv in VS Code.

- **status bar**: pulsul live + starea cognitiva (`❤ 72 DEEP_FOCUS ⌨`)
- **interventii**: apar ca notificari VS Code cu butoanele ghost-ului (Apply Fix / Not Now...);
  raspunsul tau se intoarce in bucla de invatare a ghost-ului
- **dinamica tastarii**: ritmul de tastare din editor alimenteaza clasificatorul de
  stres/oboseala — doar intervale si categorii, **niciodata continutul tastelor**
- **fatigue firewall**: daca esti FATIGUED si ghost-ul vede ceva riscant in cod, te avertizeaza
  inainte sa dai push

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

- `devlife.backendUrl` — URL-ul WS al backend-ului (default `ws://localhost:8000/ws`)
- comanda `DevLife: Reconnect` din Command Palette forteaza reconectarea
