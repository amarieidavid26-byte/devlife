// Shared "what is this?" science panel, used by BOTH the in-game HUD and the full Dashboard.
// One copy of the panel DOM + one document-level click listener, so a 💡 button
// (class "devlife-info-btn", data-info=KEY) works no matter how often a host re-renders.
//
// The explainer TEXT lives in i18n (keys info.<metric>.title/subtitle/what/how/science) so it
// follows the ro/en toggle; only the academic citations stay in English (real paper titles).
// Kept in sync with biometric_engine.classify() and DashboardOverlay.update().

import { i18n } from '../i18n/index.js';

const PUBMED = id => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;

// Per-metric citations (paper titles stay in English on purpose). The plain-language text is
// resolved from i18n at open time via the metric key.
export const INFO = {
    biology: { cites: [
        { text: 'Kim et al. (2018). Stress and Heart Rate Variability: A Meta-Analysis and Review. Psychiatry Investig.', pmid: '29486547' },
        { text: 'Shaffer & Ginsberg (2017). An Overview of Heart Rate Variability Metrics and Norms. Front Public Health.', pmid: '29034226' },
        { text: 'Low HRV, emotional dysregulation & prefrontal function -- an integrative view (2021). J Personalized Medicine.', pmid: '34575648' },
        { text: 'A disinhibitory circuit mechanism for peak performance at mid-level arousal (2024). PNAS.', pmid: '38277436' },
    ] },
    stress: { cites: [
        { text: 'Kim et al. (2018). Stress and Heart Rate Variability: A Meta-Analysis and Review. Psychiatry Investig.', pmid: '29486547' },
        { text: 'Shaffer & Ginsberg (2017). An Overview of Heart Rate Variability Metrics and Norms. Front Public Health.', pmid: '29034226' },
    ] },
    cognitive_load: { cites: [
        { text: 'Task difficulty influences heart rate variability (2026). Scientific Reports.', pmid: '41820547' },
        { text: 'HRV reveals graded task-difficulty effects via time-domain analysis (2025). J Physiological Anthropology.', pmid: '41286973' },
        { text: 'Low HRV, emotional dysregulation & prefrontal function — an integrative view (2021). J Personalized Medicine.', pmid: '34575648' },
        { text: "HRV in assessing surgeons' stress — systematic review & meta-analysis (2026). Healthcare.", pmid: '41753997' },
    ] },
    autonomic: { cites: [
        { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms (RMSSD ⇒ vagal tone). Front Public Health.', pmid: '29034226' },
        { text: 'Kim et al. (2018). Stress and Heart Rate Variability: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
        { text: 'Brain–Heart Interactions and Optimizing Psychotherapy (2025). Appl Psychophysiol Biofeedback.', pmid: '39969644' },
    ] },
    state: { cites: [
        { text: 'A disinhibitory circuit mechanism for peak performance at mid-level arousal (2024). PNAS.', pmid: '38277436' },
        { text: 'Norepinephrine-mediated arousal drives inverted-U connectivity dynamics (2025). Nature Communications.', pmid: '41390822' },
        { text: 'Low HRV & prefrontal dysfunction — an integrative view (2021). J Personalized Medicine.', pmid: '34575648' },
    ] },
    cqi: { cites: [
        { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
        { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
    ] },
    recovery: { cites: [
        { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
        { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
    ] },
    hrv: { cites: [
        { text: 'Shaffer & Ginsberg (2017). An Overview of HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
        { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
    ] },
    strain: { cites: [
        { text: 'A disinhibitory circuit mechanism for peak performance at mid-level arousal (2024). PNAS.', pmid: '38277436' },
        { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
    ] },
};

// HTML for a 💡 button. Drop it next to any term; clicks are caught by the shared listener.
// The tooltip resolves at render time, so it follows the current language.
export function infoBtn(key) {
    return `<span class="devlife-info-btn" data-info="${key}" role="button" tabindex="0" title="${i18n.t('info.btn_tooltip')}">&#128161;</span>`;
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

export function openInfo(key) {
    ensureInfoPanel();
    const info = INFO[key];
    if (!info) return;
    document.getElementById('dl-info-title').textContent = i18n.t(`info.${key}.title`);
    document.getElementById('dl-info-subtitle').textContent = i18n.t(`info.${key}.subtitle`);
    const cites = info.cites.map(c =>
        `<li>${escapeHtml(c.text)} <a href="${PUBMED(c.pmid)}" target="_blank" rel="noopener">PMID ${c.pmid}</a></li>`
    ).join('');
    // the what/science values are author-trusted HTML; the how (formula) is escaped
    document.getElementById('dl-info-body').innerHTML =
        `<div class="dl-info-h">${escapeHtml(i18n.t('info.section_what'))}</div><p>${i18n.t(`info.${key}.what`)}</p>` +
        `<div class="dl-info-h">${escapeHtml(i18n.t('info.section_how'))}</div><div class="dl-formula">${escapeHtml(i18n.t(`info.${key}.how`))}</div>` +
        `<div class="dl-info-h">${escapeHtml(i18n.t('info.section_science'))}</div><p>${i18n.t(`info.${key}.science`)}</p>` +
        `<ol class="dl-cites">${cites}</ol>`;
    document.getElementById('dl-info-disc').textContent = i18n.t('info.disclaimer');
    document.getElementById('dl-info-close').setAttribute('aria-label', i18n.t('info.close_aria'));
    document.getElementById('dl-info-backdrop').classList.add('open');
}

export function closeInfo() {
    const b = document.getElementById('dl-info-backdrop');
    if (b) b.classList.remove('open');
}

let _ready = false;

export function ensureInfoPanel() {
    if (_ready) return;
    _ready = true;
    injectStyles();

    const wrap = document.createElement('div');
    wrap.id = 'dl-info-backdrop';
    wrap.innerHTML = `
        <div id="dl-info-card" role="dialog" aria-modal="true">
            <button id="dl-info-close" aria-label="Close">&times;</button>
            <div id="dl-info-title"></div>
            <div id="dl-info-subtitle"></div>
            <div id="dl-info-body"></div>
            <div class="dl-info-disc" id="dl-info-disc"></div>
        </div>`;
    document.body.appendChild(wrap);

    // ONE delegated listener for every 💡 button anywhere + closing the panel
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.devlife-info-btn');
        if (btn) { e.stopPropagation(); openInfo(btn.dataset.info); return; }
        if (e.target.id === 'dl-info-backdrop' || e.target.id === 'dl-info-close') closeInfo();
    });
    document.addEventListener('keydown', (e) => {
        const btn = e.target.closest && e.target.closest('.devlife-info-btn');
        if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openInfo(btn.dataset.info); return; }
        if (e.key === 'Escape' && wrap.classList.contains('open')) { e.stopPropagation(); e.preventDefault(); closeInfo(); }
    }, true);
}

function injectStyles() {
    if (document.getElementById('dl-info-styles')) return;
    const s = document.createElement('style');
    s.id = 'dl-info-styles';
    s.textContent = `
.devlife-info-btn {
    cursor:pointer;font-size:12px;margin-left:6px;opacity:0.5;
    transition:opacity 0.2s,transform 0.2s,filter 0.2s;
    user-select:none;line-height:1;display:inline-block;vertical-align:middle;filter:grayscale(0.35);
    pointer-events:auto; /* stay clickable even inside a pointer-events:none HUD */
}
.devlife-info-btn:hover,.devlife-info-btn:focus { opacity:1;transform:scale(1.25);filter:grayscale(0) drop-shadow(0 0 6px rgba(255,200,90,0.7));outline:none; }
#dl-info-backdrop {
    position:fixed;inset:0;background:rgba(10,8,4,0.74);
    display:none;align-items:center;justify-content:center;z-index:2000;
    -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
    font-family:'Nunito',system-ui,sans-serif;
}
#dl-info-backdrop.open { display:flex;animation:dlFadeIn 0.18s ease; }
@keyframes dlFadeIn { from{opacity:0} to{opacity:1} }
#dl-info-card {
    width:min(680px,92vw);max-height:84vh;overflow-y:auto;
    background:linear-gradient(160deg,#2A2620,#201B13);
    border:1px solid rgba(255,228,181,0.18);border-radius:14px;
    padding:26px 30px 24px;box-shadow:0 24px 60px rgba(0,0,0,0.6);
    color:#F5F0E8;scrollbar-width:thin;animation:dlRise 0.2s ease;
}
@keyframes dlRise { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
#dl-info-card::-webkit-scrollbar { width:8px; }
#dl-info-card::-webkit-scrollbar-thumb { background:rgba(255,228,181,0.15);border-radius:4px; }
#dl-info-close { float:right;cursor:pointer;font-size:24px;color:#8A7E6A;line-height:1;margin:-4px -6px 0 0;background:none;border:none;font-family:inherit; }
#dl-info-close:hover { color:#F5F0E8; }
#dl-info-title { font-family:'Fredoka',sans-serif;font-size:25px;font-weight:700;margin-bottom:3px;color:#6AD89A; }
#dl-info-subtitle { font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8A88C;margin-bottom:18px; }
#dl-info-card .dl-info-h { font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#FFB84A;font-weight:800;margin:18px 0 7px; }
#dl-info-card p { font-size:14.5px;line-height:1.62;color:#E6DCCC;margin-bottom:8px; }
#dl-info-card .dl-formula {
    font-family:'JetBrains Mono',monospace;font-size:12.5px;background:rgba(0,0,0,0.32);
    border-left:3px solid #6AD89A;padding:11px 13px;border-radius:6px;
    color:#D4CABC;white-space:pre-wrap;line-height:1.55;
}
#dl-info-card ol.dl-cites { margin:6px 0 0;padding-left:20px; }
#dl-info-card ol.dl-cites li { font-size:13px;line-height:1.5;color:#C9BCA6;margin-bottom:8px; }
#dl-info-card ol.dl-cites a { color:#7FB0FF;text-decoration:none;font-weight:700;white-space:nowrap; }
#dl-info-card ol.dl-cites a:hover { text-decoration:underline; }
#dl-info-card .dl-info-disc { margin-top:20px;padding-top:13px;border-top:1px solid rgba(255,228,181,0.1);font-size:11.5px;color:#8A7E6A;font-style:italic;line-height:1.5; }
#dl-info-card .dl-plate { display:block;width:100%;height:auto;margin:4px 0 8px;border:1px solid rgba(255,228,181,0.14);border-radius:8px;background:#F5F0E8; }
#dl-info-card .dl-plate-cap { font-size:11.5px;color:#8A7E6A;text-align:right;margin:0 0 4px; }
#dl-info-card .dl-plate-cap a { color:#7FB0FF;text-decoration:none;font-weight:700; }
`;
    document.head.appendChild(s);
}
