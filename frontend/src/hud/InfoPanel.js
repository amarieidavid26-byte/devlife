// Shared "what is this?" science panel, used by BOTH the in-game HUD and the full Dashboard.
// One copy of the explainer content + one panel DOM + one document-level click listener, so a
// 💡 button (class "devlife-info-btn", data-info=KEY) works no matter how often a host
// re-renders its markup (the HUD rebuilds its innerHTML on every biometric update).
//
// Content is kept in sync with the real algorithm in biometric_engine.classify() and
// DashboardOverlay.update(). Sources are peer-reviewed (PubMed). See docs/dashboard-science.md.

const PUBMED = id => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;

export const INFO = {
    stress: {
        title: 'Stress Level',
        subtitle: 'Scale 0.0 – 3.0 · derived from HRV',
        what: 'A live estimate of how much strain your nervous system is under. It rises when your heart-rate variability (HRV) drops below your own normal range — a well-established physiological fingerprint of stress.',
        how: 'ratio = current HRV (RMSSD) ÷ your 14-reading baseline\n\nratio ≥ 0.85  → 0.5   (calm)\nratio < 0.85  → 1.2\nratio < 0.75  → 1.8\nratio < 0.60  → 2.5   (high)\n\nWith a live Bluetooth heart rate, an elevated HR raises the score too.',
        science: 'HRV — the tiny beat-to-beat changes in heart rhythm — is a validated, non-invasive window into the autonomic nervous system. A meta-analysis of 37 studies found psychological stress is reliably linked to <strong>reduced HRV</strong>, especially vagally-mediated components like RMSSD. We compare against your <strong>personal baseline</strong> rather than fixed cut-offs because healthy HRV varies widely between individuals.',
        cites: [
            { text: 'Kim et al. (2018). Stress and Heart Rate Variability: A Meta-Analysis and Review. Psychiatry Investig.', pmid: '29486547' },
            { text: 'Shaffer & Ginsberg (2017). An Overview of Heart Rate Variability Metrics and Norms. Front Public Health.', pmid: '29034226' },
        ],
    },
    cognitive_load: {
        title: 'Cognitive Load',
        subtitle: 'Index 0 – 100% · mental workload',
        what: 'How much mental effort your body is carrying right now — the physiological "cost" of concentration. Sustained high load is when mistakes start to creep in.',
        how: 'cognitiveLoad % = (stress ÷ 3) × 100\n\nAutonomic arousal (the stress index) is used as a proxy for mental workload.',
        science: 'Mental workload measurably suppresses HRV: as a task gets harder, time-domain HRV falls in a <strong>graded, dose-dependent</strong> way. This works because the same prefrontal circuits that sustain focus also regulate the heart (the "neurovisceral integration" model), so cardiac signals track executive demand. HRV is used in the field to gauge operator workload — e.g. surgeons under pressure.',
        cites: [
            { text: 'Task difficulty influences heart rate variability (2026). Scientific Reports.', pmid: '41820547' },
            { text: 'HRV reveals graded task-difficulty effects via time-domain analysis (2025). J Physiological Anthropology.', pmid: '41286973' },
            { text: 'Low HRV, emotional dysregulation & prefrontal function — an integrative view (2021). J Personalized Medicine.', pmid: '34575648' },
            { text: "HRV in assessing surgeons' stress — systematic review & meta-analysis (2026). Healthcare.", pmid: '41753997' },
        ],
    },
    autonomic: {
        title: 'Autonomic Balance',
        subtitle: 'SNS vs PNS · sympathovagal balance',
        what: 'Your autonomic nervous system has two opposing branches. The <strong>sympathetic</strong> branch (SNS) is "fight-or-flight" — it speeds you up. The <strong>parasympathetic</strong> branch (PNS) is "rest-and-digest" — it calms you down. The bars show which one is winning right now.',
        how: 'PNS bar = min(HRV ÷ 80ms, 1)     ← vagal / recovery tone\nSNS bar = min(stress ÷ 3, 1)       ← arousal / activation\n\nSNS clearly > PNS → "Fight-or-flight dominant"\nPNS clearly > SNS → "Rest-and-digest dominant"\nelse              → "Balanced"',
        science: 'RMSSD-based HRV is a recognised marker of <strong>parasympathetic (vagal)</strong> activity, so higher HRV means stronger rest-and-digest tone. Stress shifts this balance toward <strong>sympathetic dominance</strong> and away from vagal control. The brain and heart continuously negotiate this balance via the brain–heart axis.',
        cites: [
            { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms (RMSSD ⇒ vagal tone). Front Public Health.', pmid: '29034226' },
            { text: 'Kim et al. (2018). Stress and Heart Rate Variability: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
            { text: 'Brain–Heart Interactions and Optimizing Psychotherapy (2025). Appl Psychophysiol Biofeedback.', pmid: '39969644' },
        ],
    },
    state: {
        title: 'Cognitive State',
        subtitle: '5 states · Yerkes–Dodson inverted-U',
        what: 'DevLife sorts each moment into one of five states — RELAXED, DEEP_FOCUS, WIRED, STRESSED, FATIGUED — using the <strong>inverted-U law</strong>: performance peaks at <em>moderate</em> arousal and falls off when you are under-aroused (tired, bored) or over-aroused (stressed, wired).',
        how: 'Inputs: WHOOP recovery, day strain, the HRV stress index, and live HR if paired.\n\nlow recovery / poor sleep       → FATIGUED\nhigh stress / very high strain  → STRESSED\nhigh strain + low recovery      → WIRED\nmoderate-arousal "sweet spot"   → DEEP_FOCUS\notherwise                       → RELAXED',
        science: 'The Yerkes–Dodson law (1908) — peak performance at intermediate arousal — has been <strong>re-validated with modern neuroscience</strong>. A cortical disinhibitory circuit was shown to produce peak performance at mid-level arousal, and norepinephrine-driven arousal produces inverted-U brain-network dynamics. Because lower HRV maps to weaker prefrontal control, the high-arousal states are when error rates climb.',
        cites: [
            { text: 'A disinhibitory circuit mechanism for peak performance at mid-level arousal (2024). PNAS.', pmid: '38277436' },
            { text: 'Norepinephrine-mediated arousal drives inverted-U connectivity dynamics (2025). Nature Communications.', pmid: '41390822' },
            { text: 'Low HRV & prefrontal dysfunction — an integrative view (2021). J Personalized Medicine.', pmid: '34575648' },
        ],
    },
    cqi: {
        title: 'Code Quality Index (CQI)',
        subtitle: 'Index 0 – 100% · "fitness to ship"',
        what: 'A single readout of how well-suited your current physiology is for high-quality coding — blending how recovered, how calm, and how regulated you are.',
        how: 'CQI % = ( recovery/100        × 0.40\n        + min(HRV/80, 1)     × 0.35\n        + (1 − stress/3)     × 0.25 ) × 100',
        science: 'CQI is DevLife\'s own composite — not a clinical score — but each ingredient is independently validated: recovery/sleep readiness, vagally-mediated HRV as a marker of self-regulation capacity, and the HRV-based stress index. The rationale is the neurovisceral link: better autonomic regulation supports the prefrontal control that careful programming depends on.',
        cites: [
            { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
            { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
        ],
    },
    recovery: {
        title: 'Recovery',
        subtitle: '0 – 100% · WHOOP daily readiness',
        what: 'How ready your body is to perform today, scored each morning by WHOOP from your overnight physiology. Higher = better recovered.',
        how: 'Reported directly by WHOOP (recovery_score) — primarily driven by your\novernight HRV, resting heart rate, sleep and respiratory rate.',
        science: 'Recovery readiness is built on the same autonomic markers as the rest of the dashboard: overnight vagally-mediated HRV and resting heart rate. Higher HRV / lower resting HR indicate stronger parasympathetic recovery.',
        cites: [
            { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
            { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
        ],
    },
    hrv: {
        title: 'HRV (heart-rate variability)',
        subtitle: 'RMSSD, milliseconds · WHOOP',
        what: 'The tiny beat-to-beat variation in your heart rhythm. Counter-intuitively, MORE variability is healthier — it signals a flexible, well-recovered nervous system. It is the raw signal most of this dashboard is built on.',
        how: 'Reported by WHOOP as hrv_rmssd_milli (RMSSD, in ms). DevLife keeps a rolling\n14-reading baseline and reads stress from how far current HRV sits below it.',
        science: 'RMSSD is the standard short-term, time-domain HRV metric and reflects <strong>parasympathetic (vagal)</strong> activity. Reduced HRV is reliably linked to stress and to weaker prefrontal/executive control.',
        cites: [
            { text: 'Shaffer & Ginsberg (2017). An Overview of HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
            { text: 'Kim et al. (2018). Stress and HRV: A Meta-Analysis. Psychiatry Investig.', pmid: '29486547' },
        ],
    },
    strain: {
        title: 'Day Strain',
        subtitle: '0 – 21 · cardiovascular load',
        what: 'How much cardiovascular load you have accumulated today, on WHOOP\'s 0–21 scale. It rises with exertion and elevated heart rate over the day.',
        how: 'Reported directly by WHOOP (cycle strain), a logarithmic 0–21 scale derived\nfrom time spent in heart-rate zones across the day.',
        science: 'Strain summarises cardiovascular exertion; combined with recovery it drives the inverted-U state model — high strain on low recovery pushes you toward the over-aroused WIRED/STRESSED states where error rates rise.',
        cites: [
            { text: 'A disinhibitory circuit mechanism for peak performance at mid-level arousal (2024). PNAS.', pmid: '38277436' },
            { text: 'Shaffer & Ginsberg (2017). HRV Metrics and Norms. Front Public Health.', pmid: '29034226' },
        ],
    },
};

// HTML for a 💡 button. Drop it next to any term; clicks are caught by the shared listener.
export function infoBtn(key) {
    return `<span class="devlife-info-btn" data-info="${key}" role="button" tabindex="0" title="What is this? Science &amp; sources">&#128161;</span>`;
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

export function openInfo(key) {
    ensureInfoPanel();
    const info = INFO[key];
    if (!info) return;
    document.getElementById('dl-info-title').textContent = info.title;
    document.getElementById('dl-info-subtitle').textContent = info.subtitle;
    const cites = info.cites.map(c =>
        `<li>${escapeHtml(c.text)} <a href="${PUBMED(c.pmid)}" target="_blank" rel="noopener">PMID ${c.pmid}</a></li>`
    ).join('');
    // info.what / info.science are author-trusted HTML; info.how (a formula) is escaped
    document.getElementById('dl-info-body').innerHTML =
        `<div class="dl-info-h">What it means</div><p>${info.what}</p>` +
        `<div class="dl-info-h">How DevLife computes it</div><div class="dl-formula">${escapeHtml(info.how)}</div>` +
        `<div class="dl-info-h">The science</div><p>${info.science}</p>` +
        `<ol class="dl-cites">${cites}</ol>`;
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
            <div class="dl-info-disc">DevLife estimates wellness &amp; arousal signals for productivity insight &mdash; it is not a medical device and does not provide diagnosis.</div>
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
`;
    document.head.appendChild(s);
}
