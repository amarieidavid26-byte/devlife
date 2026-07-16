// all the dashboard CSS, injected once
let _stylesInjected = false;

export function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const s = document.createElement('style');
    s.id = 'dov-styles';
    s.textContent = `
#dov-root {
    position:fixed;top:0;left:0;width:100%;height:100%;
    overflow:hidden;
    background:rgba(42,36,28,0.9);
    color:#F5F0E8;
    font-family:'Nunito',system-ui,sans-serif;
    z-index:500;
    display:none;
}
#dov-root::before {
    content:'';position:absolute;top:0;left:0;width:100%;height:100%;
    background-image:
        linear-gradient(rgba(255,228,181,0.008) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,228,181,0.008) 1px,transparent 1px);
    background-size:48px 48px;
    pointer-events:none;z-index:0;
}
#dov-root * { box-sizing:border-box; margin:0; padding:0; }

#dov-root .dash {
    display:grid;
    grid-template-columns:60fr 40fr;
    grid-template-rows:48px 1fr 150px;
    width:100%;height:100%;gap:0;
    position:relative;z-index:1;
    border:2px solid transparent;transition:border-color 0.4s;
}
#dov-root .dash.pulse { animation:dovBorderPulse 2s ease-out; }
@keyframes dovBorderPulse { 0%{border-color:var(--dov-state-color)} 100%{border-color:transparent} }

#dov-root .topbar {
    grid-column:1/-1;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 32px;
    background:rgba(30,24,16,0.5);
    border-bottom:1px solid rgba(255,228,181,0.12);
}
#dov-root .topbar-logo { font-family:'Fredoka',sans-serif;font-weight:700;letter-spacing:0.18em;color:#F5F0E8;font-size:13px; }
#dov-root .topbar-logo span { color:var(--dov-state-color,#6AD89A);transition:color 0.5s; }
#dov-root .topbar-clock { font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;color:#D4CABC;letter-spacing:0.1em; }
#dov-root .topbar-right { display:flex;align-items:center;gap:10px;font-family:'Nunito',sans-serif;font-size:11px;letter-spacing:0.06em; }
#dov-root .session-dot { width:8px;height:8px;border-radius:50%;background:#3A2E1C;transition:background 0.3s;flex-shrink:0; }
#dov-root .session-dot.on { background:#6AD89A;animation:dovPulseGlow 2s ease-in-out infinite; }
@keyframes dovPulseGlow { 0%,100%{box-shadow:0 0 4px rgba(106,216,154,0.3)} 50%{box-shadow:0 0 12px rgba(106,216,154,0.7)} }
#dov-root .tab-hint { color:#6A5E4C;font-size:11px;letter-spacing:0.06em; }

#dov-root .left {
    padding:32px 40px;
    display:flex;flex-direction:column;gap:32px;
    border-right:1px solid rgba(255,228,181,0.08);
    overflow-y:auto;scrollbar-width:none;
}
#dov-root .left::-webkit-scrollbar { display:none; }
#dov-root .sec-hdr { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;font-weight:600;margin-bottom:12px; }
#dov-root .hr-section { display:flex;flex-direction:column; }
#dov-root .hr-row { display:flex;align-items:baseline;gap:14px; }
#dov-root .hr-heart { font-size:34px;display:inline-block;transform-origin:center; }
#dov-root .hr-value {
    font-family:'JetBrains Mono',monospace;font-size:100px;font-weight:700;
    color:#F5F0E8;line-height:1;transition:opacity 0.1s;
    text-shadow:0 0 20px var(--dov-state-color,rgba(106,216,154,0.3));
}
#dov-root .hr-unit { font-family:'JetBrains Mono',monospace;font-size:24px;color:#8A7E6A;font-weight:400; }
@keyframes dovHeartbeat { 0%,100%{transform:scale(1)} 15%{transform:scale(1.25)} 30%{transform:scale(1)} }

#dov-root .metrics { display:flex;gap:48px; }
#dov-root .metric .val {
    font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;
    color:#F5F0E8;line-height:1;
    text-shadow:0 0 12px var(--dov-state-color,rgba(106,216,154,0.2));
}
#dov-root .metric .unit { font-family:'Nunito',sans-serif;font-size:18px;font-weight:400;color:#8A7E6A; }
#dov-root .metric .lbl { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;margin-top:6px; }

#dov-root .state-name {
    font-family:'Fredoka',sans-serif;font-size:64px;font-weight:700;
    line-height:1;transition:color 0.5s;
}
#dov-root .state-lbl { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;margin-top:8px; }

#dov-root .stress-header { display:flex;justify-content:space-between;align-items:center;margin-bottom:8px; }
#dov-root .stress-header .lbl { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C; }
#dov-root .stress-header .val { font-family:'JetBrains Mono',monospace;font-size:14px;color:#D4CABC; }
#dov-root .stress-track { width:100%;height:8px;background:rgba(255,228,181,0.06);border-radius:4px;overflow:hidden; }
#dov-root .stress-fill { height:100%;border-radius:4px;transition:width 0.6s ease,background 0.6s ease; }

#dov-root .cqi-section { display:flex;flex-direction:column; }
#dov-root .cqi-row { display:flex;align-items:center;gap:14px;margin-bottom:6px; }
#dov-root .cqi-val { font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;transition:color 0.4s; }
#dov-root .cqi-track { width:200px;height:8px;background:rgba(255,228,181,0.06);border-radius:4px;overflow:hidden; }
#dov-root .cqi-fill { height:100%;border-radius:4px;transition:width 0.6s ease,background 0.6s ease; }
#dov-root .cqi-hint { font-family:'Nunito',sans-serif;font-size:12px;color:#B8A88C;line-height:1.4;transition:color 0.3s; }

#dov-root .ans-section { display:flex;flex-direction:column; }
#dov-root .ans-bars { display:flex;align-items:flex-end;gap:8px;height:48px;margin-bottom:6px; }
#dov-root .ans-bar-group { display:flex;flex-direction:column;align-items:center;gap:3px; }
#dov-root .ans-bar { width:28px;border-radius:3px 3px 0 0;transition:height 0.6s ease;min-height:2px; }
#dov-root .ans-bar-lbl { font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:#8A7E6A; }
#dov-root .ans-status { font-family:'Nunito',sans-serif;font-size:12px;color:#B8A88C;transition:color 0.3s; }

#dov-root .hrv-spark-canvas { width:100%;height:80px;display:block;border-radius:6px;background:rgba(30,24,16,0.3); }
#dov-root .gauges-row { display:flex;gap:48px;align-items:flex-start; }
#dov-root .gauge-box { text-align:center; }
#dov-root .gauge-box .sec-hdr { margin-bottom:8px; }
#dov-root .gauge-val { font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:#F5F0E8; }
#dov-root .gauge-sub { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;margin-top:4px; }

#dov-root .right {
    padding:32px 28px;
    display:flex;flex-direction:column;gap:24px;
    border-left:1px solid rgba(255,228,181,0.08);
    overflow-y:auto;scrollbar-width:none;
}
#dov-root .right::-webkit-scrollbar { display:none; }

#dov-root .threat {
    display:flex;align-items:center;gap:14px;
    padding:16px 20px;border-radius:8px;
    background:rgba(30,24,16,0.35);
    border:1px solid rgba(255,228,181,0.06);
    transition:border-color 0.4s;
}
#dov-root .threat-dot { width:14px;height:14px;border-radius:50%;flex-shrink:0;transition:all 0.4s; }
#dov-root .threat-label { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C; }
#dov-root .threat-val { font-family:'Fredoka',sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;transition:color 0.4s; }
#dov-root .threat.nominal .threat-dot { background:#6AD89A;box-shadow:0 0 10px rgba(106,216,154,0.5); }
#dov-root .threat.nominal .threat-val { color:#6AD89A; }
#dov-root .threat.nominal { border-color:rgba(106,216,154,0.12); }
#dov-root .threat.elevated .threat-dot { background:#FFB84A;box-shadow:0 0 10px rgba(255,184,74,0.5); }
#dov-root .threat.elevated .threat-val { color:#FFB84A; }
#dov-root .threat.elevated { border-color:rgba(255,184,74,0.12); }
#dov-root .threat.critical .threat-dot { background:#FF7A6A;box-shadow:0 0 10px rgba(255,122,106,0.5);animation:dovPulseRed 1s ease-in-out infinite; }
#dov-root .threat.critical .threat-val { color:#FF7A6A; }
#dov-root .threat.critical { border-color:rgba(255,122,106,0.15); }
@keyframes dovPulseRed { 0%,100%{box-shadow:0 0 8px rgba(255,122,106,0.4)} 50%{box-shadow:0 0 22px rgba(255,122,106,0.9)} }

#dov-root .int-count {
    font-family:'JetBrains Mono',monospace;font-size:14px;color:#D4CABC;
    letter-spacing:1px;padding-bottom:4px;
    border-bottom:1px solid rgba(255,228,181,0.06);
}
#dov-root .int-count strong { font-size:20px;color:#F5F0E8;font-weight:700; }

#dov-root .log-title { font-family:'Nunito',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;font-weight:600; }
#dov-root .log-scroll { flex:1;overflow-y:auto;scrollbar-width:none; }
#dov-root .log-scroll::-webkit-scrollbar { display:none; }
#dov-root .log-entry { padding:16px 0;border-bottom:1px solid rgba(255,228,181,0.04); }
#dov-root .log-meta { display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap; }
#dov-root .log-icon { font-size:14px;line-height:1; }
#dov-root .log-time { font-family:'JetBrains Mono',monospace;font-size:11px;color:#8A7E6A; }
#dov-root .log-badge { padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;color:#fff; }
#dov-root .log-state { padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;color:#fff; }
#dov-root .log-msg { font-family:'Nunito',sans-serif;font-size:13px;color:#D4CABC;line-height:1.55; }
#dov-root .log-entry.critical {
    background:rgba(255,122,106,0.06);border-left:3px solid #FF7A6A;
    padding-left:14px;margin-left:-14px;
}
#dov-root .log-empty { color:#6A5E4C;font-size:13px;letter-spacing:0.08em;padding:40px 0;text-align:center;font-family:'JetBrains Mono',monospace; }

#dov-root .bottom {
    grid-column:1/-1;
    border-top:1px solid rgba(255,228,181,0.12);
    position:relative;background:rgba(30,24,16,0.4);
    transition:border-color 0.3s;
}
#dov-root .bottom.alarm { border-top:2px solid #FF7A6A;animation:dovEcgAlarm 0.8s ease-in-out infinite; }
@keyframes dovEcgAlarm { 0%,100%{border-top-color:#FF7A6A} 50%{border-top-color:rgba(255,122,106,0.15)} }
#dov-root .ecg-canvas { width:100%;height:100%;display:block; }
#dov-root .ecg-lbl-left { position:absolute;top:12px;left:20px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#8A7E6A;text-transform:uppercase;letter-spacing:2px; }
#dov-root .ecg-lbl-right { position:absolute;top:10px;right:24px;display:flex;align-items:baseline;gap:5px; }
#dov-root .ecg-bpm-num { font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:#D4CABC;transition:color 0.3s; }
#dov-root .ecg-bpm-unit { font-family:'JetBrains Mono',monospace;font-size:12px;color:#8A7E6A; }
`;
    document.head.appendChild(s);
}
