// Generator pentru documentatie-finala.docx — DevLife InfoEducatie 2026
// Structura: 10 capitole conform docs/rubric-matrix.md + screenshot placeholders

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, TabStopType, TabStopPosition,
} = require("docx");

// ====== HELPERS ======

// Arial = font universal compatibil cu Google Docs (Calibri se substituie la import)
const FONT = "Arial";
const MONO = "Consolas"; // Google Docs il mapeaza la Courier New
const TEXT_SIZE = 22; // 11pt
const HEADING1_SIZE = 40; // 20pt — mai mare pentru impact
const HEADING2_SIZE = 30; // 15pt
const HEADING3_SIZE = 26; // 13pt

// Paleta — tonuri reci profesionale care fac contrast cu accentul rosu
const COLOR_PRIMARY = "1F3864";    // navy inchis — H1, header tabel
const COLOR_SECONDARY = "2E74B5";  // albastru mediu — H2
const COLOR_TERTIARY = "548DD4";   // albastru deschis — H3
const COLOR_ACCENT = "E94560";     // rosu accent — accente, placeholder-uri
const COLOR_MUTED = "888888";      // gri — header/footer/captions
const COLOR_QUOTE = "5A5A5A";      // gri inchis — testimoniale
const COLOR_CODE_BG = "F2F4F7";    // gri foarte deschis — fundal cod
const COLOR_CODE_TEXT = "1A1A2E";  // navy aproape negru — text cod

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: TEXT_SIZE, font: FONT, bold: opts.bold, italics: opts.italic })],
  });
}

function pRich(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    children: runs.map(r => {
      if (typeof r === "string") return new TextRun({ text: r, size: TEXT_SIZE, font: FONT });
      return new TextRun({ text: r.text, size: TEXT_SIZE, font: FONT, bold: r.bold, italics: r.italic, color: r.color });
    }),
  });
}

function h1(text) {
  // H1: bara colorata jos + page break inainte pentru aerare
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 320 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 18, color: COLOR_ACCENT, space: 4 },
    },
    children: [new TextRun({ text, size: HEADING1_SIZE, bold: true, font: FONT, color: COLOR_PRIMARY })],
  });
}

function h2(text) {
  // H2: bara stanga colorata pentru a-l face vizual distinct
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_SECONDARY, space: 12 },
    },
    children: [new TextRun({ text, size: HEADING2_SIZE, bold: true, font: FONT, color: COLOR_PRIMARY })],
  });
}

function h3(text) {
  // H3: italic + culoare diferentiata vs H2
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, size: HEADING3_SIZE, bold: true, italics: true, font: FONT, color: COLOR_TERTIARY })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, size: TEXT_SIZE, font: FONT })],
  });
}

function bulletRich(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 280 },
    children: runs.map(r => {
      if (typeof r === "string") return new TextRun({ text: r, size: TEXT_SIZE, font: FONT });
      return new TextRun({ text: r.text, size: TEXT_SIZE, font: FONT, bold: r.bold, italics: r.italic });
    }),
  });
}

function screenshot(num, desc) {
  // Placeholder screenshot: chenar gros punctat + iconita + descriere
  return new Paragraph({
    spacing: { before: 240, after: 240, line: 300 },
    alignment: AlignmentType.CENTER,
    border: {
      top: { style: BorderStyle.DASHED, size: 12, color: COLOR_ACCENT, space: 8 },
      bottom: { style: BorderStyle.DASHED, size: 12, color: COLOR_ACCENT, space: 8 },
      left: { style: BorderStyle.DASHED, size: 12, color: COLOR_ACCENT, space: 8 },
      right: { style: BorderStyle.DASHED, size: 12, color: COLOR_ACCENT, space: 8 },
    },
    shading: { fill: "FFF5F5", type: ShadingType.CLEAR },
    indent: { left: 200, right: 200 },
    children: [
      new TextRun({ text: `📷  SCREENSHOT ${num}`, bold: true, size: TEXT_SIZE + 2, font: FONT, color: COLOR_ACCENT }),
      new TextRun({ break: 1 }),
      new TextRun({ text: desc, italics: true, size: TEXT_SIZE - 2, font: FONT, color: COLOR_QUOTE }),
    ],
  });
}

function code(text) {
  // Bloc cod: fundal subtil + chenar accentuat la stanga + font mono
  return new Paragraph({
    spacing: { before: 160, after: 160, line: 280 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_SECONDARY, space: 8 },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" },
    },
    shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
    indent: { left: 100 },
    children: [new TextRun({ text, font: MONO, size: 20, color: COLOR_CODE_TEXT })],
  });
}

function quote(text, attribution) {
  // Testimonial: bara stanga colorata + italic + atribuire pe rand nou
  return new Paragraph({
    spacing: { before: 200, after: 200, line: 320 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_ACCENT, space: 16 },
    },
    indent: { left: 200 },
    children: [
      new TextRun({ text: `„${text}"`, italics: true, size: TEXT_SIZE, font: FONT, color: COLOR_QUOTE }),
      new TextRun({ break: 1 }),
      new TextRun({ text: `— ${attribution}`, size: TEXT_SIZE - 2, font: FONT, color: COLOR_MUTED }),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "", size: TEXT_SIZE })] });
}

// Tabel cu antet + rânduri
function table(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: "1F3864", type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        spacing: { after: 0, line: 260 },
        children: [new TextRun({ text: h, bold: true, size: TEXT_SIZE - 2, font: FONT, color: "FFFFFF" })],
      })],
    })),
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: row.map((cellText, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: idx % 2 === 0 ? undefined : { fill: "F5F5F5", type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        spacing: { after: 0, line: 260 },
        children: [new TextRun({ text: cellText, size: TEXT_SIZE - 2, font: FONT })],
      })],
    })),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

// ====== CONȚINUT DOCUMENT ======

const children = [];

// ====== COPERTĂ ======
// Bara colorata sus + titlu mare + linie subtila + subtitlu
children.push(
  // Bara colorata accent sus
  new Paragraph({
    spacing: { before: 0, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 48, color: COLOR_ACCENT, space: 0 } },
    children: [new TextRun({ text: "", size: 2 })],
  }),
  new Paragraph({ spacing: { before: 2400 }, children: [new TextRun("")] }),
  // Titlu mare
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "DevLife", bold: true, size: 120, font: FONT, color: COLOR_PRIMARY })],
  }),
  // Linie despartitoare
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_ACCENT, space: 4 } },
    indent: { left: 3000, right: 3000 },
    children: [new TextRun({ text: "", size: 2 })],
  }),
  // Subtitlu
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: "AI Companion biometric pentru dezvoltatori", italics: true, size: 36, font: FONT, color: COLOR_SECONDARY })],
  }),
  // Sectiune metadate proiect (box cu shading)
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "DOCUMENTAȚIA PROIECTULUI", bold: true, size: 28, font: FONT, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1400 },
    children: [new TextRun({ text: "InfoEducație 2026  ·  Secțiunea Software Utilitar", size: 26, font: FONT, color: COLOR_PRIMARY })],
  }),
  // Autori
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: "AUTORI", bold: true, size: 22, font: FONT, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "David Amariei", bold: true, size: 32, font: FONT, color: COLOR_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1800 },
    children: [new TextRun({ text: "Matei Vultur", bold: true, size: 32, font: FONT, color: COLOR_PRIMARY })],
  }),
  // Footer copertă
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "Repository", size: 20, font: FONT, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "github.com/amarieidavid26-byte/devlife", italics: true, size: 22, font: FONT, color: COLOR_SECONDARY })],
  }),
);

// ====== CUPRINS ======
// h1() pune automat page break inainte, deci nu mai e nevoie de PageBreak explicit
children.push(
  h1("Cuprins"),
  new TableOfContents("Cuprins automat", { hyperlink: true, headingStyleRange: "1-3" }),
);

// ====== 1. INTRODUCERE ======
children.push(
  h1("1. Introducere"),

  h2("1.1. Prezentarea generală a proiectului"),
  p("DevLife este un companion AI biometric destinat dezvoltatorilor software, care monitorizează în timp real starea fiziologică a utilizatorului prin senzori de tip wearable și intervine activ când detectează că deciziile cognitive ale acestuia sunt compromise. Aplicația combină trei piloni tehnologici care, până la momentul acestei lucrări, nu au fost integrați niciodată într-un singur produs: biometrice reale provenite din ceasul WHOOP și dintr-o bandă cardiacă conectată prin Bluetooth, înțelegere contextuală asistată de inteligență artificială prin API-ul Anthropic Claude, și mecanism de blocare activă a comenzilor periculoase, denumit Fatigue Firewall."),
  p("Din punct de vedere al utilizatorului, aplicația se prezintă ca o cameră izometrică 2.5D explorabilă, populată de un companion vizual numit „Ghost\", care reacționează în timp real la starea biometrică detectată. Sub această interfață prietenoasă, însă, există un sistem complet de procesare a datelor fiziologice, clasificare cognitivă în cinci stări distincte și raționament asistat de un model de limbaj de ultimă generație. Această dualitate — un companion vizual deasupra unui sistem tehnic robust — este o decizie de design deliberată, motivată în secțiunea 1.4."),
  screenshot(1, "Meniul principal al aplicației, cu intro cinematic animat și butoanele START / DEMO / SETTINGS. Paleta caldă Animal Crossing și font Fredoka."),

  h2("1.2. Problema adresată"),
  p("Performanța cognitivă a dezvoltatorilor software nu este o constantă, ci o funcție directă a stării lor fiziologice. Această afirmație nu este o speculație, ci un fapt cu o literatură clinică solidă. Yerkes-Dodson (1908) a demonstrat că performanța cognitivă urmează o curbă în U inversat: prea puțin arousal — oboseală, plictiseală — duce la decizii proaste, iar prea mult arousal — stres, frică — la fel. Optimumul se află undeva la mijloc, într-o zonă pe care literatura modernă o numește „flow state\". Peifer și colaboratorii (2014) au arătat că flow-ul corelează cu HRV crescut și activare simpatică ușoară — un profil biometric distinct, măsurabil cu echipamentele actuale. Cai și colaboratorii (2018) au demonstrat că privarea de somn reduce capacitatea de evaluare a riscului advers cu până la 30%, în special pentru decizii ireversibile."),
  p("Pentru dezvoltatori, aceste constatări științifice se traduc în comportamente concrete și costisitoare. La ore târzii, după mai multe ore de lucru continuu, dezvoltatorii execută comenzi distructive pe care ulterior le regretă: `git push --force` pe ramura de producție, `rm -rf` rulat dintr-un director greșit, `DROP TABLE` pe baza de date live în loc de cea de staging, code review-uri aprobate fără să fie citite, sau bug-uri introduse în faza pe care orice dezvoltator a trăit-o cel puțin o dată — „ar trebui să mă duc la culcare, dar mai fac un fix\"."),
  p("Soluțiile actuale ale acestei probleme sunt insuficiente. Aplicațiile de tip Pomodoro propun timere mecanice care nu știu dacă utilizatorul este efectiv obosit sau doar plictisit. RescueTime și instrumentele similare oferă post-mortem analytics, nu prevenție. Wearable-urile precum Oura sau WHOOP oferă rapoarte biometrice excelente, dar într-un dashboard separat de fluxul de cod. Asistenții AI de tip GitHub Copilot sugerează cod, dar nu știu nimic despre starea fizică a utilizatorului. Niciun produs nu integrează cele trei niveluri necesare: biometrice reale, înțelegere contextuală a codului scris și intervenție activă bazată pe ambele."),

  h2("1.3. Audiența țintă"),
  p("DevLife se adresează în primul rând dezvoltatorilor solo și freelancerilor care lucrează ore lungi fără supervizare directă, inginerilor SRE și DevOps aflați în rotație on-call cu acces la sisteme de producție, și studenților la informatică în perioade intense de proiect sau examen. Audiența secundară include echipele mici unde CTO-ul caută un mecanism de siguranță pentru incidentele de la ore târzii, cercetătorii din domeniul biometricii aplicate la performanța muncii și comunitatea Quantified Self."),
  p("Cerințele minime de utilizare sunt un wearable compatibil — WHOOP fiind suportat nativ, dar Garmin și Apple Watch sunt prevăzute în roadmap-ul pe termen scurt — sau acceptarea utilizării datelor simulate pentru evaluarea aplicației. Aplicația nu necesită cunoștințe avansate de configurare: instalarea locală este complet automatizată prin scripturi shell, iar varianta cu date mock funcționează imediat după prima rulare."),

  h2("1.4. Originalitate și inovație"),
  p("Aspectul de „joc\" — camera izometrică, Ghost-ul AI care se mișcă prin scenă, scenele exterioare Cafe și Cowork — nu este un capriciu estetic, ci o decizie de design centrată pe psihologia adopției. Un dezvoltator este mult mai probabil să lase aplicația deschisă timp de ore dacă aceasta arată ca un companion vizual prietenos decât dacă arată ca un dashboard medical. Camera izometrică creează un atașament emoțional pe care un grafic cu indicatori biometrici nu îl poate produce, iar acest atașament este precondiția pentru ca firewall-ul cognitiv să funcționeze efectiv — un firewall pe o aplicație închisă nu protejează pe nimeni."),
  p("Trei elemente fac DevLife un produs cu adevărat distinctiv în ecosistemul curent. Primul este Fatigue Firewall: singura aplicație analizată care blochează activ comenzi periculoase pe baza stării fiziologice, nu doar avertizează. Al doilea este pipeline-ul complet biometric→cod, care leagă date fiziologice de acțiuni concrete în editorul de cod prin cinci aplicații integrate. Al treilea este sistemul Apply Fix, care propune modificări de cod prin AI dar le validează prin contract Pydantic, le previzualizează utilizatorului, le auditează într-o bază de date și permite rollback — un nivel de safety neobișnuit pentru un proiect studențesc, dar necesar pentru un produs care propune modificări de cod."),
  screenshot(2, "Camera izometrică principală în stare RELAXED, cu Ghost vizibil, HUD biometric în colț și paleta caldă Animal Crossing."),
);

// ====== 2. ARHITECTURĂ ======
children.push(
  h1("2. Arhitectura și tehnologiile utilizate"),

  h2("2.1. Arhitectura generală"),
  p("Aplicația este structurată în cinci straturi distincte, conectate prin trei canale de comunicare: WebSocket bidirecțional pentru actualizări în timp real, REST pentru operații cu semantică stabilă, și apeluri către trei servicii externe (Claude API, WHOOP API, Chrome Web Bluetooth)."),
  spacer(),
  code("┌─────────────────────────────────────────────────────────┐\n│                    Browser (PixiJS)                      │\n│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │\n│  │ Cameră 2.5D│  │ HUD overlay│  │ Apps (5 surfaces)│   │\n│  │ izometrică │  │ biometrică │  │ Code/Term/Browse │   │\n│  └────────────┘  └────────────┘  └──────────────────┘   │\n└────────────────────────────┬─────────────────────────────┘\n                             │ ws:// + REST\n┌────────────────────────────▼─────────────────────────────┐\n│              FastAPI Backend (Python)                     │\n│  ┌──────────────┐  ┌─────────────────┐  ┌────────────┐  │\n│  │ AppState     │  │ biometric_loop  │  │ ghost_loop │  │\n│  │ (centralizat)│  │ (5s polling)    │  │ (1s tick)  │  │\n│  └──────────────┘  └─────────────────┘  └────────────┘  │\n└──────┬───────────────────┬──────────────────┬────────────┘\n       │                   │                  │\n       ▼                   ▼                  ▼\n┌──────────────┐  ┌──────────────────┐  ┌─────────────┐\n│ SQLite WAL   │  │  Claude API      │  │ WHOOP API   │\n│ persistență  │  │  (Anthropic)     │  │ + Chrome BLE│\n└──────────────┘  └──────────────────┘  └─────────────┘"),
  screenshot(3, "Diagrama arhitecturii — fie diagrama ASCII din document, fie o diagramă desenată separat cu Excalidraw."),
  p("Frontend-ul este construit cu PixiJS 7 pentru randarea camerei izometrice procedurale și a HUD-ului biometric, iar suprafețele aplicațiilor (Code Editor, Terminal, Browser, Notes, Chat) sunt suprapuneri DOM peste canvas-ul WebGL. Comunicarea cu backend-ul se face prin WebSocket pentru mesaje cu latență mică — actualizări biometrice, intervenții, schimbări de stare — și prin REST pentru operațiile cu semantică tranzacțională (Apply Fix preview/confirm/rollback)."),
  p("Backend-ul este implementat în Python 3.11 cu FastAPI, găzduind un dataclass `AppState` centralizat care încapsulează toată starea aplicației — clienții WebSocket conectați, istoricul intervențiilor, cooldown-urile, patch-urile pending — pentru a evita variabilele globale împrăștiate. Două thread-uri daemon rulează în paralel cu event loop-ul asyncio: `biometric_loop` interoghează WHOOP API la fiecare 5 secunde (sau citește datele mock în mod offline), iar `ghost_loop` evaluează la fiecare 1 secundă dacă există conținut nou de analizat și dacă utilizatorul trebuie să primească o intervenție. Comunicarea dintre thread-uri și event loop-ul async se face prin `asyncio.run_coroutine_threadsafe()`, soluția standard pentru marshaling-ul broadcast-urilor."),

  h2("2.2. Tehnologii frontend"),
  p("Pentru randarea camerei izometrice a fost ales PixiJS 7, o bibliotecă WebGL hardware-accelerată de aproximativ 50KB minified, fără opinii arhitecturale impuse. Alternativele considerate au fost respinse din motive specifice: Three.js este excesiv pentru o aplicație 2.5D care nu folosește profunzime reală, iar Phaser impune un model de joc cu loop și entități care ar fi adăugat complexitate fără beneficii pentru cazul nostru de utilizare. PixiJS permite construirea procedurală a întregii scene — mobilier, atmosferă, Ghost, plant, ECG live — fără sprite sheets pentru elementele de bază, doar cu primitive grafice."),
  p("Editorul de cod in-game folosește Monaco Editor, același motor care alimentează Visual Studio Code. Această alegere oferă utilizatorului o experiență identică cu cea dintr-un IDE real — sintaxă highlight, autocomplete, multi-cursor, suport pentru zeci de limbaje — într-un context embeddable în pagina web. Alternativele considerate (CodeMirror, Ace) ar fi fost mai ușoare, dar ar fi creat o discrepanță vizuală evidentă față de uneltele cu care dezvoltatorii lucrează zilnic."),
  p("Sunetele aplicației sunt sintetizate procedural prin Web Audio API, prin clasa `SoundManager`. Niciun fișier audio extern nu este inclus în repo — această decizie a fost luată după curățarea unor fișiere MP3 cu drepturi de autor neclare, iar prezența integrală a sunetelor sintetizate elimină orice posibilă problemă de licență. Web Audio API permite generarea de tone, drone-uri ambientale și efecte pentru fiecare interacțiune, controlabile prin volum master persistent în localStorage."),
  p("Audio este gestionat prin biblioteca Howler, aleasă pentru API-ul său simplu și compatibilitatea cross-browser. Internaționalizarea folosește un modul propriu minimal (`i18n/index.js`) care încarcă fișierele `ro.json` și `en.json`, persistă preferința în localStorage și suportă listeneri `onChange` pentru reactivitate fără reload al paginii. Bundler-ul este Vite, ales pentru viteza dev server-ului și pentru build-ul optimizat în producție."),

  h2("2.3. Tehnologii backend"),
  p("Python a fost ales ca limbaj de backend pentru ecosistemul său dominant în domeniile AI și biometric: SDK-ul oficial Anthropic, biblioteca scipy pentru analiza HRV, ImageHash pentru deduplicarea screenshot-urilor în modul desktop, și o mulțime de wrapper-e pentru API-uri biometrice sunt toate disponibile native. FastAPI a fost ales ca framework web pentru patru caracteristici decisive: validarea automată Pydantic pe toate endpoint-urile, suport nativ pentru WebSocket fără biblioteci adiționale, async/await pentru operații I/O non-blocking integrat natural cu thread-urile pentru lucrul CPU-bound, și type hints care fac codul self-documenting."),
  p("Persistența folosește SQLite în mod WAL (Write-Ahead Logging). Această alegere are trei motive: zero overhead de deployment (nu necesită un proces server separat), conformitate ACID completă, și concurența non-blocking pentru reads paralele cu writes — esențială pentru un sistem care scrie continuu sample-uri biometrice (la fiecare 5 secunde) dar citește istoricul atunci când utilizatorul deschide vederea de istoric. Pentru ~500 inserturi pe oră ai unui utilizator activ, complexitatea PostgreSQL ar fi fost nejustificată. În plus, baza de date este un singur fișier `devlife.db` portabil — poate fi copiat pe orice mașină pentru investigație."),
  p("Rate limiting-ul este implementat prin biblioteca `slowapi`, compatibilă direct cu pattern-ul FastAPI Limiter, cu aproximativ 100 de linii de cod și fără dependințe heavy. Decoratorul declarativ `@limiter.limit(\"30/minute\")` aplicat pe endpoint-uri sensibile (în special `/api/biometric/mock`) previne abuzul prin spam. Logging-ul este structurat prin modulul `logging` standard al Python — niciun `print()` în cod, toate mesajele cu nivel configurabil, niciun secret nu apare în log-uri."),

  h2("2.4. Integrarea biometrică (WHOOP API + Web Bluetooth)"),
  p("DevLife combină două surse de date biometrice complementare pentru a obține atât date „lente\" agregate (recovery, strain, sleep performance, HRV trends), cât și BPM live în timp real. WHOOP API oferă datele agregate prin OAuth 2.0 — utilizatorul autentifică o singură dată în setări, iar tokenul este reîmprospătat automat înainte de expirare. Datele sunt interogate la fiecare 5 secunde, deși API-ul propriu-zis are refresh interval mai lung; această interogare permite detectarea promptă a schimbărilor de stare cognitivă."),
  p("Datele live de BPM, necesare pentru clasificarea stărilor de stres acut și pentru sleep mode, nu sunt furnizate de API-ul WHOOP. Soluția implementată folosește Chrome Web Bluetooth API direct pentru a conecta banda WHOOP la browser și a citi caracteristica standard BLE Heart Rate Service. Frontend-ul trimite valoarea BPM-ului prin WebSocket către backend, care o injectează în pipeline-ul de clasificare cu prioritate maximă: când BLE este conectat și transmite date proaspete (în ultimele 5 secunde), valorile lente WHOOP sunt suprascrise. Această dualitate — REST pentru date lente + BLE pentru date live — este una dintre deciziile arhitecturale netriviale ale proiectului."),
  p("O logică suplimentară dezactivează automat manual override-ul (hotbar-ul 1-5 pentru schimbarea mock a stărilor) când BLE este activ. Această decizie previne coliziuni între datele reale și cele simulate, asigurând că într-o sesiune live nimeni nu poate falsifica accidental starea cognitivă."),

  h2("2.5. Integrarea inteligenței artificiale (Claude API)"),
  p("Inteligența contextuală a aplicației este furnizată de Claude Sonnet 4 prin SDK-ul oficial Anthropic. Modelul a fost ales pentru patru caracteristici esențiale pentru cazul nostru: capacitate de reasoning de top pentru analiză de cod, returnarea consistentă a JSON-ului structurat (fără bracket-uri lipsă sau câmpuri neașteptate), suport pentru system prompts diferențiate per context, și un cost per token acceptabil pentru un proiect deschis. Clientul Anthropic este instanțiat în două locuri — `ghost_brain.py` pentru generarea răspunsurilor Ghost și `content_analyzer.py` pentru analiza conținutului — ambele cu timeout explicit de 15 secunde pentru a preveni blocarea thread-urilor în cazul în care API-ul atârnă."),
  p("Pentru fiecare dintre cele cinci aplicații in-game (Code, Terminal, Browser, Notes, Chat) există un prompt dedicat care îi spune lui Claude ce să caute. Pentru Code, prompt-ul cere detecția bug-urilor cu evaluarea probabilității utilizatorului de a fi „stuck\", o sugestie de cod fixată dacă este cazul, și o evaluare a priorității. Pentru Terminal, prompt-ul este mult mai compact pentru că o tăietură importantă elimină majoritatea cazurilor înainte de apelul API: înainte de orice apel către Claude, conținutul terminal este verificat împotriva a 11 pattern-uri regex care detectează comenzile periculoase. Dacă unul se potrivește, Ghost răspunde instant cu o template-uri hardcoded — latență sub 10 milisecunde, fără apel API, fără cost."),

  h2("2.6. Instrumente și medii de dezvoltare"),
  p("Dezvoltarea a folosit Visual Studio Code ca IDE principal, cu extensiile Python, ESLint, și Prettier pentru consistență de stil. Bundler-ul Vite a fost folosit pentru frontend, oferind dev server cu hot module reload la port 5173. Backend-ul rulează pe `uvicorn` ca server ASGI, la portul 8000 în dezvoltare. Scripturile shell din folderul `scripts/` automatizează cele mai frecvente operații: `setup.sh` creează venv-ul și instalează dependințele Python și Node, `dev.sh` pornește backend-ul și frontend-ul în paralel, `run-tests.sh` execută suita de teste și produce raportul HTML de coverage, `healthcheck.sh` verifică endpoint-urile critice."),
  p("Pentru deployment, fișierul `Procfile` la rădăcina repo-ului definește comanda pe care Railway o execută în producție, iar `runtime.txt` specifică versiunea Python (3.11.9). Variabilele de mediu necesare pentru producție — `CLAUDE_API_KEY`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`, `ALLOWED_ORIGINS` — se configurează din dashboard-ul Railway, niciodată hardcodate în cod sau commit-uite în repo."),

  h2("2.7. Sistem de testare"),
  p("Suita de teste numără 71 de teste pytest. Nucleul original acoperă logica de business: `test_apply_fix.py` (contract, validator, lifecycle preview-confirm-rollback), `test_biometric_classifier.py` (toate cele cinci stări cognitive și callback-ul de schimbare a stării), `test_fallback.py` (răspunsuri pre-cached și mock biometric reproductibil), `test_server_smoke.py` (endpoint-uri HTTP + factory de analyzer), `test_ws_flow.py` și `test_run_error_routing.py` (fluxul WebSocket de la connect la mesaje validate). Capabilitățile reale noi au propriile suite: `test_security.py` (path-traversal, token, Origin, CSRF), `test_whoop_tokens.py` (persistența tokenului + scope-ul offline), `test_terminal_pty.py` / `test_terminal_ws.py` (PTY real, gating, echo), `test_file_api.py` (I/O în workspace + gating), `test_inline_ws.py` (streaming completări) și `test_lsp_bridge.py` (handshake real pyright)."),
  p("Coverage-ul total este 69%. Modulele de safety rămân complet acoperite (apply_fix 94-100%, fallback_responses 100%, security cu path-traversal și CSRF testate exhaustiv). Path-urile către servicii externe — Claude, WHOOP — nu sunt apelate cu credențiale reale în CI; sunt protejate prin try/except cu fallback testat, iar contractele de input/output sunt verificate. Capabilitățile reale noi sunt validate atât prin pytest, cât și live în Chromium: terminal zsh real, round-trip de fișiere, completare Haiku, și diagnostice + completări pyright prin punte. Suita rulează în aproximativ 3 secunde pe un MacBook Air M-series."),

  h2("2.8. Arhitectura IDE-ului local (editor, terminal, LSP)"),
  p("Deoarece backend-ul FastAPI rulează local pe mașina utilizatorului, are acces complet la filesystem și la subprocese, iar browser-ul rămâne un client subțire peste WebSocket — exact modelul code-server / VS Code Server, fără a fi nevoie de Electron. Pe acest principiu sunt construite patru capabilități reale: editorul Monaco bundle-uit care editează fișiere de pe disc (`file_api.py` + rutele `/api/files/*`), terminalul real prin pseudo-terminal (`terminal_pty.py` + WebSocket `/terminal`), completările inline streaming de la Claude Haiku (`inline_completer.py` + WebSocket `/inline`), și puntea LSP către pyright / typescript-language-server (`lsp_bridge.py` + WebSocket `/lsp/{language}`)."),
  p("Toate aceste endpoint-uri sunt privilegiate — expun shell real, scriere pe disc și subprocese — deci sunt protejate de un strat de securitate dedicat (token de sesiune + verificare Origin + bind pe loopback, descris în 4.8) și pot fi dezactivate prin flag-uri (`TERMINAL_ENABLED`, `FILES_ENABLED`, `LSP_ENABLED`, `INLINE_AI_ENABLED`) pe deploy-uri găzduite, unde nu trebuie să fie active. Editorul Monaco este acum împachetat ca ESM local (nu de pe CDN), deci IDE-ul funcționează complet offline. Detalii complete în `docs/local-ide.md`."),
);

// ====== 3. FUNCȚIONALITĂȚI ======
children.push(
  h1("3. Funcționalități și implementare"),

  h2("3.1. Clasificarea biometrică în cinci stări cognitive"),
  p("Inima aplicației este algoritmul de clasificare a stării cognitive curente a utilizatorului în una dintre cinci categorii: RELAXED, DEEP_FOCUS, STRESSED, FATIGUED, WIRED. Clasificarea folosește o cascadă de reguli derivate din literatura clinică Yerkes-Dodson și din metricile pe care WHOOP le expune nativ — recovery (procent 0-100), strain (0-21), sleep performance (procent 0-100), HRV (milisecunde), heart rate de bază (BPM)."),
  spacer(),
  code("if recovery < 40 or sleep < 0.7:\n    state = FATIGUED\nelif estimated_stress >= 2.0 or strain > 16:\n    state = STRESSED\nelif strain > 12 and recovery < 60:\n    state = WIRED\nelif 0.9 <= estimated_stress <= 1.5 and 8 <= strain <= 14 and recovery > 60:\n    state = DEEP_FOCUS\nelse:\n    state = RELAXED"),
  p("Stresul estimat se calculează din raportul HRV curent / HRV baseline personal (mediat pe o fereastră de 14 zile). Un raport sub 0.6 indică stres acut (estimated_stress 2.5), între 0.6 și 0.75 indică oboseală sistemică (1.8), între 0.75 și 0.85 indică efort moderat (1.2), iar peste 0.85 indică recovery bun (0.5). Această normalizare per-utilizator este esențială pentru că HRV absolut variază enorm între persoane — un sportiv poate avea HRV 80ms ca baseline, un sedentar 45ms; același 35ms înseamnă lucruri diferite pentru cei doi."),
  p("Comportamentul Ghost-ului este complet adaptat stării cognitive. În DEEP_FOCUS, intervenția este tăcută cu excepția erorilor critice — un studiu citat în prompt-ul system menționează că recâștigarea flow-ului după o întrerupere durează în medie peste 20 de minute. În STRESSED, Ghost-ul devine suportiv, sugerează tehnica de respirație box breathing (4 secunde in, 4 hold, 4 out, 4 hold), și încurajează micile victorii. În FATIGUED, Ghost-ul devine protectiv și activează Fatigue Firewall-ul pentru comenzi distructive. În WIRED, Ghost-ul răspunde direct, scurt, anti-overthinking. În RELAXED, Ghost-ul este curios și sugerează abordări creative."),
  screenshot(4, "Dashboard-ul biometric complet, vizibil cu TAB. HR, HRV, recovery, strain, sleep performance, CQI, autonomic balance și graficul ECG live procedural."),

  h2("3.2. Fatigue Firewall — blocare activă a comenzilor distructive"),
  p("Fatigue Firewall este caracteristica cea mai distinctivă a aplicației și singura din ecosistemul analizat care blochează activ comenzi periculoase pe baza stării fiziologice. Detecția folosește 11 pattern-uri regex compilate (latență sub 1 ms) verificate înainte de orice apel către Claude API — această tăietură de cale rapidă (numită „CUT 1\" în cod) este esențială pentru ca firewall-ul să fie utilizabil în practică."),
  spacer(),
);

// Tabel cu cele 11 patterns
children.push(
  table(
    ["#", "Pattern", "Descriere"],
    [
      ["1", "rm\\s+(-[a-zA-Z]*f[a-zA-Z]*\\s+|.*-rf\\s+)", "rm -rf, șterge permanent"],
      ["2", "git\\s+push\\s+.*--force", "force push, suprascrie remote"],
      ["3", "git\\s+push\\s+-f\\b", "force push (forma scurtă)"],
      ["4", "DROP\\s+(TABLE|DATABASE|INDEX)", "DROP, distrug structuri DB"],
      ["5", "chmod\\s+777\\b", "permisiuni excesive"],
      ["6", "sudo\\s+rm\\b", "delete cu privilegii ridicate"],
      ["7", "git\\s+reset\\s+--hard", "pierde modificări necomise"],
      ["8", "DELETE\\s+FROM\\s+\\w+", "șterge rânduri DB"],
      ["9", "docker\\s+rm\\s+-f", "force remove container activ"],
      ["10", "npm\\s+publish\\b", "publicare pachet npm"],
      ["11", "\\benv\\b", "env dump, posibil leak secrete"],
    ],
    [700, 4200, 4460],
  ),
);

children.push(
  spacer(),
  p("Când starea cognitivă este FATIGUED ȘI conținutul terminalului conține unul dintre aceste pattern-uri, Ghost-ul afișează imediat — fără apel API, prin template-ul hardcoded din `_instant_risky_response()` — un mesaj cu format: „FATIGUE FIREWALL — HRV 28ms, stress 1.8/3.0. 'force push' este ireversibil. Salvează-ți munca întâi.\" Mesajul este însoțit de trei butoane: „Salvează Draft\" (acțiunea preferată, care face commit + amend mâine), „Fă-o Oricum\" (escape valve pentru cazuri legitime) și „Amintește-mi mai târziu\" (suprimare temporară 10 secunde a aceluiași pattern)."),
  p("Caracteristica psihologic interesantă a acestui mesaj este utilizarea datelor personale ca rationale. În loc de un avertisment generic („Această comandă este distructivă\"), Ghost-ul citează biometricele exacte ale utilizatorului ca argument: HRV-ul tău este la 28ms, mai jos decât baseline-ul tău personal de 52ms, stresul tău estimat este 1.8 din 3 — în acest context, această comandă specifică este o decizie pe care probabil o vei regreta. Acest pattern (date personale ca argument pentru o decizie) este unic în ecosistemul analizat."),
  screenshot(5, "FATIGUE FIREWALL în acțiune: comanda 'git push --force origin main' tastată în terminal, mesajul Ghost cu biometrice și butoanele Save Draft / Do It Anyway / Remind Later."),

  h2("3.3. Apply Fix — lifecycle complet pentru patch-uri de cod"),
  p("Când Ghost-ul detectează un bug în codul scris în Code Editor, propune un fix. Această sugestie nu se aplică niciodată automat — trece prin cinci etape de validare și confirmare. Prima etapă este validarea pe backend: patch-ul este descris ca un `PatchContract` Pydantic care include calea fișierului, limbajul, range-ul de linii (start, end), textul de înlocuire, textul original și un rationale obligatoriu. Validatorul aplică reguli concrete: maximum 50 de linii (atât în range, cât și în replacement), rationale non-vid, end_line ≥ start_line, și absența metacaracterelor de shell în replacement (`os.system`, `subprocess.`, `;rm`, backticks, `$()`). Patch-urile care nu trec validarea sunt înregistrate în audit ca „reject\" cu motivul, dar nu sunt stocate."),
  p("A doua etapă este previzualizarea UI. Frontend-ul afișează un dialog side-by-side cu codul original în stânga și codul propus în dreapta, ambele cu sintaxă highlight Monaco. Diff-ul este evidențiat vizual: liniile adăugate apar pe fond galben, cele șterse pe fond roșu. Rationale-ul lui Claude apare în footer, urmat de două butoane: „Confirmă\" și „Anulează\". Utilizatorul trebuie să dea click explicit — nu există confirmare implicită prin timeout."),
  screenshot(6, "Dialog Apply Fix preview: cod 'Înainte' (stânga) vs 'După' (dreapta) cu diff highlighted, rationale Claude jos, butoane Confirma / Anuleaza."),
  p("A treia etapă este aplicarea. Odată confirmat, frontend-ul înlocuiește conținutul editorului și emite un toast care permite rollback printr-un click. A patra etapă este auditul: fiecare acțiune (preview, confirm, rollback, reject) este înscrisă în tabelul `apply_fix_audit` din SQLite, împreună cu un hash al patch-ului, calea fișierului, range-ul original și timestamp-ul. A cincea etapă este rollback-ul: pre-imaginea (textul original) este stocată în memorie în `pending_patches` indexat pe hash; un click pe „Revert\" face un POST către `/api/apply-fix/rollback` care returnează textul original și înscrie acțiunea în audit. Acest nivel de safety — preview obligatoriu + confirmare explicită + audit complet + rollback — este standard enterprise pentru SOC compliance."),
  screenshot(7, "Audit log Apply Fix vizualizat cu sqlite3 sau DB Browser: rânduri preview, confirm și rollback cu timestamp și patch_hash."),

  h2("3.4. Mod offline / demo (DEMO_OFFLINE)"),
  p("Flag-ul de mediu `DEMO_OFFLINE=true` forțează toate apelurile externe să fie mock-uite. WHOOP API este înlocuit cu date simulate generate de `MockBiometrics` cu un seed determinist (42), Claude API este înlocuit cu fallback responses pre-cached din `fallback_responses.py`, iar BLE este înlocuit cu date simulate cu jitter realist. Frontend-ul detectează modul degradat și afișează un banner explicit „Mod degradat — demo offline\" în partea de sus a ecranului, astfel încât utilizatorul (sau juriul) să fie conștient că datele nu sunt reale."),
  p("Acest mod este critic pentru prezentarea live. Wifi-ul poate pica, API-ul Claude poate avea probleme momentane, banda WHOOP poate avea baterie descărcată — toate aceste eventualități ar putea ruina un demo. Cu `DEMO_OFFLINE=true`, aplicația rulează identic, deterministic, reproductibil, fără dependențe externe. Comutarea între modul live și modul demo se face printr-o singură variabilă de mediu și nu necesită modificări de cod."),
  screenshot(8, "Banner 'Mod degradat' afișat în partea de sus a aplicației când DEMO_OFFLINE=true este activ."),

  h2("3.5. Sleep mode automat"),
  p("Aplicația detectează automat când utilizatorul adoarme sau își scoate banda WHOOP. Logica este implementată în funcția `_check_sleep_mode()`: dacă banda BLE este conectată și transmite, dar heart rate-ul este sub 50 BPM pentru cinci cicluri consecutive (aproximativ 25 secunde), sleep mode-ul este activat. Alternativ, dacă banda BLE nu transmite date timp de 10 secunde, același sleep mode se activează (probabil utilizatorul și-a scos echipamentul)."),
  p("În sleep mode, camera izometrică se întunecă, Ghost-ul se retrage cu o animație de tip „cuibărit\" și șoptește „noapte bună\" în limba activă. Nicio intervenție nu mai apare, niciun sunet nu mai este redat. Când heart rate-ul revine peste 50 BPM (sau BLE revine cu date proaspete), sleep mode-ul se dezactivează automat. Acest mecanism oferă o experiență fără frecare — utilizatorul nu trebuie să închidă aplicația înainte de culcare, aceasta se „culcă\" împreună cu el."),
  screenshot(9, "Sleep mode activ: camera întunecată, Ghost retras în animație de sleep, mesaj „noapte bună\" vizibil."),

  h2("3.6. Dashboard biometric live"),
  p("HUD-ul biometric este permanent vizibil în colțul ecranului în formă compactă, cu un graphic ECG procedural mic și valorile principale: HR (heart rate), HRV (heart rate variability), recovery, strain, sleep performance. Apăsarea tastei TAB deschide overlay-ul Dashboard extins (BeneathView), care afișează metrici derivate suplimentare: CQI (Cognitive Quality Index, o metrică compozită ponderată din recovery, HRV și inversul stresului), Autonomic Balance (raport simpatic/parasimpatic estimat din HRV ratio), Recovery Velocity (timpul în secunde în care HR-ul revine la baseline după un peak), Sleep Performance defalcat pe REM, deep sleep și eficiență."),
  p("Graficul ECG este sintetizat procedural pe canvas pentru a oferi feedback vizual continuu fără overhead de imagini. Trend-ul HR-ului — rising, falling, stable — este derivat din ultimele două sample-uri și afișat ca săgeată în HUD. Baseline-ul HR-ului este recalibrat dinamic prin medierea celor mai scăzute 20% din sample-urile recente, astfel încât aplicația învață ce este „normal\" pentru utilizatorul curent."),
  screenshot(10, "Dashboard Overlay (BeneathView) deschis cu TAB: HR, HRV, ECG procedural, CQI, Autonomic Balance, Recovery Velocity și sleep breakdown."),

  h2("3.7. Internaționalizare (i18n RO/EN)"),
  p("Toate string-urile pe critical path sunt procesate prin funcția `i18n.t(key, vars)`. Două fișiere JSON conțin traducerile: `ro.json` și `en.json`. Limba implicită este română (proiectul este românesc), persistată în `localStorage[devlife_lang]`. Toggle-ul se află în meniul Settings, accesibil din meniul principal sau în orice moment. Modulul i18n suportă listeneri `onChange(fn)` astfel încât UI-ul reacționează la schimbarea limbii fără reload — o operație care, în absența listenerilor, ar pierde starea curentă a aplicației. Mesajele tehnice (numele variabilelor de mediu, output-ul comenzilor) rămân în engleză indiferent de limbă, fiind context tehnic universal."),
  screenshot(11, "Meniul Settings cu toggle-ul Limbă vizibil — opțiunile RO și EN."),

  h2("3.8. Persistență locală"),
  p("Toate datele aplicației sunt persistate într-un singur fișier SQLite numit `devlife.db`, plasat în directorul de lucru curent. La pornire, modulul de persistență conectează DB-ul cu PRAGMA `journal_mode=WAL` (Write-Ahead Logging) pentru a permite citiri non-blocking concurente cu scrieri, apoi rulează idempotent migrațiile din `persistence/migrations/*.sql`. Conexiunea este partajată între thread-uri (cu `check_same_thread=False`) deoarece atât thread-ul biometric, cât și cel ghost scriu în DB."),
  p("Sesiunile sunt înregistrate automat la pornire (cu `started_at`, `mode` „game\" sau „desktop\", și `whoop_connected`) și terminate la oprire. Toate intervențiile Ghost sunt persistate cu starea cognitivă, sursa (aplicația activă), un hash al conținutului și textul Claude. Sample-urile biometrice ar fi putut fi persistate, dar — pentru a evita umflarea bazei de date — sunt stocate doar la cerere prin `save_biometric()`, nu automat. Auditul Apply Fix și consent-ul OAuth au tabele dedicate. La restart, endpoint-ul `/api/history?since=<timestamp>` returnează intervențiile din sesiunile anterioare."),

  h2("3.9. Cele cinci aplicații in-game"),
  p("DevLife rulează cinci „suprafețe\" interactive în interiorul lumii izometrice, mapate la obiecte vizibile în cameră. Fiecare suprafață este o aplicație DOM suprapusă peste canvas, deschisă când utilizatorul interacționează cu obiectul corespunzător prin tasta E sau click. Fiecare aplicație are un prompt Claude dedicat (definit în `content_analyzer.py::APP_PROMPTS`) care îi spune lui Claude ce să caute în conținutul respectiv."),
  spacer(),
  bullet("CodeEditor (frontend/src/apps/CodeEditor.js) — editor Monaco. Detectează limbajul, urmărește bug-uri, oferă fix-uri prin Apply Fix. Răspunsul Claude include detecția erorilor (TypeError, undefined variables, missing imports, off-by-one, infinite loops, missing null checks), o sugestie de cod fixată și o prioritate."),
  bullet("Terminal (frontend/src/apps/Terminal.js) — emulator minimal. Detectează pattern-urile risky local înainte de orice apel API. Detectează „stuck\" (aceeași comandă eșuează repetat, up-arrow spam)."),
  bullet("Browser (frontend/src/apps/Browser.js) — browser in-app simplu. Analizează ce caută utilizatorul, detectează rabbit holes (Reddit, YouTube), sugerează revenirea la task."),
  bullet("Notes (frontend/src/apps/Notes.js) — notițe libere. Analizează tonul (anxios, planificat, brainstorm), nu intervine agresiv."),
  bullet("Chat (frontend/src/apps/Chat.js) — mesagerie cu Ghost direct. Conversație liberă cu personalitatea adaptată stării cognitive."),
  p("Frontend-ul trimite mesaje `content_update` prin WebSocket la fiecare 1.5 secunde (debounced) cu app type-ul curent. Backend-ul stochează conținutul în `pending_content[app_type]` și îl analizează în următorul tick al ghost_loop. Conținutul este limitat la 50000 de caractere pentru a preveni abuzul, iar app_type-ul este validat împotriva celor cinci valori cunoscute."),
  screenshot(12, "CodeEditor in-game (Monaco) cu cod Python scris și sugestie Apply Fix vizibilă."),
  screenshot(13, "Terminal in-game cu comanda risky tastată — `rm -rf /tmp/test` — și intervenție Ghost cu detecție instant."),

  h2("3.10. Lumea izometrică — camera, town, scenele Cafe și Cowork"),
  p("DevLife nu este doar un dashboard ci o lume vizuală 2.5D explorabilă, organizată în mai multe scene gestionate de `SceneManager`. Scena principală — Room — este camera izometrică randată cu PixiJS Graphics, populată cu mobilier integrat din Kenney Furniture Kit 2.0 (licență CC0) prin `AssetLoader`. Paleta caldă „Animal Crossing\" a fost aplicată pe toate elementele într-un commit dedicat. Plant-ul procedural crește pe baza activității utilizatorului, vignette-ul oferă focus central, iar Ghost-ul are un trail de particule cu intensitate variabilă în funcție de starea cognitivă."),
  p("Scena Town este lumea exterioară explorabilă: clădiri, drumuri, un garden cu pond, flori și gard. Player-ul are control character cu wall sliding movement și colision detection cu clădirile. Ghost-ul îl urmărește prin Town prin clasa `TownGhost`. Sistemul de dialog `TownDialogue` permite interacțiunea cu NPC-uri. Camera urmărește player-ul cu lerp smooth pentru a evita motion sickness."),
  screenshot(14, "Town Scene: player și Ghost vizibili, clădiri Cafe și Cowork distincte, garden cu pond și flori."),
  p("Scena CafeScene este o cafenea interactivă cu sistem de brewing și animații pentru NPC-uri, locul unde Ghost-ul devine mai relaxat. Scena CoworkScene este un spațiu de coworking cu NPC-uri animate și panouri interactive — atmosfera „productive zone\". Scena Park oferă mod meditație pentru reducerea stresului. Tranzitiile între scene folosesc `TransitionOverlay` cu fade-to-black de 800ms."),
  screenshot(15, "CafeScene cu sistemul de brewing interactiv vizibil și NPC-uri animate."),
  screenshot(16, "CoworkScene cu NPC-urile animate și panourile interactive."),

  h2("3.11. Sistemul de plante și creșterea procedurală"),
  p("Plant-ul din cameră este o componentă vizuală pură PIXI.Graphics (fără sprites externe) care crește procedural pe baza activității utilizatorului. Backend-ul trimite mesaje `plant_update` cu delta de creștere când starea utilizatorului se schimbă: timpul petrecut în DEEP_FOCUS adaugă creștere pozitivă, fiecare intervenție acceptată (feedback „Thanks\" sau „Apply Fix\") adaugă o cantitate mică, iar comportamentul FATIGUED prelungit aduce o degradare vizuală (fade / wilting). Această buclă vizuală oferă feedback emoțional pe termen lung — utilizatorul ajunge să-și „crească\" plant-ul prin sesiuni productive, iar regresia plant-ului este un indicator vizibil al unei perioade neglijente."),
  screenshot(17, "Plant procedural în trei stadii — mic, mediu, mare — în trei capturi side-by-side."),

  h2("3.12. Cinematice — intro main menu, capitole, outro credits"),
  p("Aplicația include două seturi de cinematice. Primul este intro-ul main menu, o secvență animată la pornire care prezintă brand-ul DevLife și face fade in lumea izometrică. Al doilea este DemoMode-ul cu chapter transitions: capitole numerotate marchează etapele demonstrației (intro → biometric setup → first intervention → fatigue firewall → apply fix → outro), fiecare cu o tranziție vizuală distinctă. La finalul DemoMode-ului, outro-ul derulează credits cu numele autorilor."),
  p("Componentele implicate sunt `TransitionOverlay.js` pentru fade-uri între scene, `DemoMode.js` pentru orchestrarea capitolelor, `DemoHotbar.js` pentru indicatorul capitolului curent, și `BeneathView.js` pentru vederea alternativă „sub suprafață\" disponibilă utilizatorului oricând prin TAB."),
  screenshot(18, "Frame din cinematic outro credits cu numele autorilor: David Amariei și Matei Vultur."),

  h2("3.13. Mod desktop (GAME_MODE=False) cu Claude Vision"),
  p("Aplicația suportă două moduri operaționale fundamentale. Modul implicit, GAME_MODE=True, este modul „joc\" descris până acum: utilizatorul lucrează în cele cinci aplicații in-game, iar backend-ul primește `content_update` direct prin WebSocket. Modul alternativ, GAME_MODE=False, este modul „desktop companion\": backend-ul folosește `screen_capture.py` (bibliotecă mss pentru captură de ecran cross-platform) pentru a face screenshot la întreg desktop-ul, iar `vision_analyzer.py` îl trimite către Claude Vision pentru analiză. Ghost-ul intervine peste orice aplicație externă reală — VS Code, terminal real, browser real."),
  p("Pentru a reduce costul în token-uri, screenshot-urile folosesc deduplicarea prin ImageHash — dacă două capturi consecutive au hash similar (sub un prag configurat), a doua nu este retrimisă. Polling-ul este configurabil (default 5 secunde) și se adaptează stării: în DEEP_FOCUS intervalul crește la 10s pentru a evita interogări inutile, în STRESSED scade la 2s pentru reactivitate maximă. Acest mod este mai costisitor în token-uri Claude, dar funcționează cu workflow-ul real al utilizatorului — un avantaj semnificativ pentru utilizatorii care nu vor să-și schimbe IDE-ul."),
  screenshot(19, "Modul desktop (GAME_MODE=False): screenshot capturat din VS Code real cu Ghost intervenind overlay peste fereastra IDE-ului."),

  h2("3.14. Fluxul de utilizare (User Flow)"),
  p("Utilizatorul pornește aplicația și vede main menu-ul cu intro cinematic. Apasă START și intră în scena Room, cu starea inițială RELAXED și HUD-ul vizibil. Dacă are WHOOP, click pe „Pair WHOOP\" inițiază OAuth flow-ul; dacă nu, hotbar-ul 1-5 permite schimbarea manuală a stărilor (sau aplicația rulează cu mock în DEMO_OFFLINE). Utilizatorul se apropie de obiecte din cameră (folosind WASD pentru navigare), apare prompt [E] deasupra obiectului, apăsarea tastei E deschide aplicația respectivă (Code, Terminal, Browser, Notes, Chat)."),
  p("În timp ce utilizatorul scrie cod sau comenzi, backend-ul analizează conținutul, detectează probleme, iar Ghost-ul intervine prin speech bubble. Pentru sugestii normale, butoanele sunt „Thanks\" / „Not Now\". Pentru sugestii cu cod, „Apply Fix\" / „Show More\" / „Not Now\". Pentru intervenții critice (Fatigue Firewall), „Save Draft\" / „Do It Anyway\" / „Remind Later\". Apăsarea tastei T tranzitionează la Town, de unde utilizatorul poate intra în Cafe sau Cowork. ESC închide aplicații deschise sau dismiss-uiește speech bubble. TAB deschide overlay-ul Dashboard extins."),

  h2("3.15. Schema bazei de date"),
  p("Schema SQLite are șase tabele, definite în `persistence/migrations/001_init.sql`. Tabelul `sessions` înregistrează fiecare rulare a aplicației (id, started_at, ended_at, mode, whoop_connected). Tabelul `interventions` păstrează fiecare intervenție Ghost (id, session_id, ts, state, source, content_hash, claude_text, fallback_used, suppressed). Tabelul `biometric_samples` stochează datele raw atunci când se cere persistare explicită (id, session_id, ts, hr, hrv, recovery, strain, source). Tabelul `feedback` colectează răspunsurile utilizatorului la intervenții (id, intervention_id, ts, rating, comment). Tabelul `apply_fix_audit` păstrează lifecycle-ul complet al patch-urilor (id, session_id, ts, file, range_before, patch_hash, action, reason). Tabelul `consent` înregistrează scope-urile OAuth aprobate (id, ts, granted_scopes_json)."),
  p("Toate query-urile folosesc parameter binding (caracterul `?` cu argumente separate) — niciodată concatenare de string-uri — eliminând complet riscul de SQL injection. Modul WAL permite citirile concurente non-blocking, ceea ce înseamnă că thread-ul biometric care scrie sample-uri nu blochează niciodată endpoint-ul `/api/history` care citește istoricul."),
  screenshot(20, "Schema bazei de date vizualizată în DB Browser for SQLite cu cele șase tabele expandate."),

  h2("3.16. Editor de fișiere reale — IDE complet în joc"),
  p("Editorul de cod din joc a evoluat de la un buffer scratch (cod hardcodat, fără salvare) la un IDE real care editează fișiere de pe disc, exact ca VS Code sau Cursor. Monaco rulează acum împachetat local ca ESM (nu de pe CDN), deci funcționează complet offline. Backend-ul expune un API de fișiere — listarea arborelui, citire, scriere atomică, creare, redenumire, ștergere — prin rute REST protejate de tokenul de sesiune; fiecare operație trece prin `resolve_in_workspace()`, care garantează că nicio cale nu iese din directorul `WORKSPACE_ROOT` (inclusiv prin symlink-uri)."),
  p("Frontend-ul oferă experiența așteptată de la un IDE: file tree lateral cu încărcare leneșă, taburi pentru fișierele deschise, deschidere prin click și salvare cu Cmd/Ctrl+S, câte un model Monaco per fișier identificat prin `Uri.file`. Un WebSocket `/files/watch` (biblioteca watchfiles) reîmprospătează arborele când fișierele se modifică extern. Integrările existente sunt păstrate intacte: pipeline-ul de analiză Ghost, Apply Fix cu preview și rollback, și butonul Run care execută Python (Pyodide) și JavaScript (Web Worker) în sandbox. Astfel, editorul oferă două căi complementare — sandbox sigur și instant pentru Run, fișiere reale pentru editare."),
  screenshot(23, "IDE-ul în joc: file tree lateral, taburi cu fișiere deschise, cod editat în Monaco, butonul Save."),

  h2("3.17. Terminal real — shell adevărat prin PTY"),
  p("Terminalul din joc a fost rescris dintr-un tabel de răspunsuri hardcodate într-un shell adevărat. Frontend-ul folosește xterm.js (același emulator de terminal din VS Code), iar backend-ul deschide un pseudo-terminal real prin modulul `pty` din biblioteca standard Python și lansează shell-ul utilizatorului (zsh) cu directorul de lucru fixat la `WORKSPACE_ROOT`. Intrarea de la tastatură călătorește ca frame-uri binare prin WebSocket `/terminal`, output-ul shell-ului se întoarce ca frame-uri binare, iar redimensionarea ferestrei este un frame de control JSON care declanșează `TIOCSWINSZ` — astfel aplicațiile full-screen (vim, htop, less) se redimensionează corect."),
  p("La închidere, procesul copil primește SIGHUP și este „reaped\", fără a lăsa procese zombie. Pentru a minimiza riscurile fork-ului într-un server multi-thread, calea absolută a shell-ului și mediul sunt construite în procesul părinte, iar copilul execută doar `chdir` + `execve`. Rezultatul: orice comandă reală rulează în workspace — `git`, `python`, `npm`, REPL-uri interactive — verificat live în Chromium (aritmetică de shell și `pwd` în workspace, cu prompt zsh autentic)."),
  screenshot(24, "Terminal real în joc: comandă executată într-un shell zsh adevărat, cu prompt și output reale."),

  h2("3.18. Completări AI inline — ghost text în stil Cursor"),
  p("Pe lângă intervențiile Ghost (speech bubbles), editorul oferă acum completări inline în stil Cursor — text fantomă (ghost text) care apare în timp ce scrii și se acceptă cu Tab. Acestea sunt generate de Claude Haiku 4.5, un model rapid și separat de Sonnet folosit pentru Ghost, printr-un prompt de tip fill-in-the-middle care primește codul dinaintea și de după cursor. Backend-ul transmite completarea în streaming prin WebSocket `/inline`, cu un debounce de aproximativ 180ms și anularea cererilor învechite la fiecare tastă nouă, astfel încât doar sugestia relevantă pentru poziția curentă este produsă."),
  p("Onestitate tehnică: un model găzduit nu atinge latența proprie a Cursor, care folosește modele dedicate cu speculative decoding. Sugestiile noastre apar în aproximativ 1-2 secunde — suficient de bun pentru asistență contextuală reală (verificat live: pentru `def add(a, b)` cu docstring, modelul a propus `return a + b`), dar nu instant per-tastă. Cele două căi AI sunt complet separate: Ghost-ul (Sonnet) reacționează la comportament și biometrice cu intervenții, completările (Haiku) oferă cod local rapid."),
  screenshot(25, "Completare inline ghost text propusă de Claude Haiku în editor, acceptabilă cu Tab."),

  h2("3.19. Inteligență de limbaj prin LSP"),
  p("Pentru inteligență de limbaj reală — diagnostice (squiggles roșii), autocomplete și hover — DevLife conectează editorul la servere de limbaj standard prin Language Server Protocol. Backend-ul (`lsp_bridge.py`) lansează pyright pentru Python sau typescript-language-server pentru JavaScript/TypeScript ca subprocese stdio și face puntea JSON-RPC între ele și browser printr-un WebSocket `/lsp/{language}`, adăugând și eliminând framing-ul Content-Length. Clientul din frontend înregistrează provideri Monaco de completare și hover, răspunde la cererile server→client (de exemplu `workspace/configuration`) și aplică diagnosticele primite ca markere în editor."),
  p("Dacă serverul de limbaj nu este instalat local, editorul degradează grațios — funcționează în continuare, doar fără diagnostice și autocomplete LSP. Integrarea a fost verificată live în Chromium: pyright a returnat diagnostice reale și peste 300 de completări prin punte. (Am ales un client LSP focusat în locul migrării la stratul greu de servicii vscode @codingame; go-to-definition între fișiere ar necesita un „editor opener\" custom și este în afara scopului actual.)"),
  screenshot(26, "Diagnostice LSP (squiggles roșii) și popup de autocomplete pyright în editorul din joc."),
);

// ====== 4. SECURITATE ======
children.push(
  h1("4. Aspecte de securitate implementate"),

  h2("4.1. Validarea datelor de intrare (Pydantic)"),
  p("Toate endpoint-urile POST validează payload-ul prin modele Pydantic. `MockStateBody` validează că starea este un întreg între 1 și 5 (cu eroare 422 automată pentru valori invalide). `FeedbackBody` validează că acțiunea este un string de maxim 100 de caractere. `PatchContract` validează un patch complet: cale fișier (max 500 caractere), limbaj (max 50), range cu start_line ≥ 1 și end_line ≥ 1, textul de înlocuire (max 50000 caractere), rationale (max 1000), severitate (din mulțimea low/medium/high/critical), text original (max 50000). `PatchHashBody` validează că hash-ul este maxim 64 de caractere."),
  p("Pentru fluxul WebSocket, care nu poate folosi decoder-ul Pydantic implicit, validarea este implementată inline cu constante explicite: `WS_MAX_CONTENT_CHARS=50000`, `WS_MAX_ACTION_CHARS=100`, `WS_MAX_KWARG_CHARS=500`, și `WS_VALID_APP_TYPES={code, terminal, browser, notes, chat}`. Aceste bounds previn umflarea memoriei și consumul excesiv de token-uri Claude prin payload-uri abuzive."),

  h2("4.2. Rate limiting"),
  p("Endpoint-ul `/api/biometric/mock` este protejat de rate limiting prin biblioteca `slowapi` cu un decorator `@limiter.limit(\"30/minute\")`. Acest endpoint permite schimbarea stării biometrice mock și este, prin natura sa, cel mai abuzabil — o cerere oferind tranzitie smooth cu asyncio.sleep(0.3). Rate limit-ul previne flooding-ul. Răspunsul la depășire este HTTP 429 cu mesajul „too many requests\". Endpoint-urile Apply Fix nu au rate limiting explicit, dar au constrângeri de validare care le fac costisitor de abuzat (validatorul rulează indiferent)."),

  h2("4.3. CORS restricționat"),
  p("Middleware-ul CORS este configurat strict prin lista `ALLOWED_ORIGINS` (citită din variabila de mediu cu același nume) — niciodată wildcard `*`. Default-ul include doar `http://localhost:5173` și `http://localhost:5174` (frontend-urile de dezvoltare). În producție, dashboard-ul Railway permite suprascrierea cu domeniul real al deployment-ului. Această configurare previne ca o pagină rău intenționată să facă apeluri la backend-ul aplicației."),

  h2("4.4. Patch contract validator"),
  p("Înainte de stocarea oricărui patch în `pending_patches`, validatorul `validate_patch()` aplică o serie de reguli: range-ul nu poate depăși 50 de linii, replacement-ul nu poate depăși 50 de linii, rationale-ul nu poate fi vid (un patch fără justificare este rejectat), end_line ≥ start_line, și replacement-ul nu poate conține pattern-uri de shell injection. Pattern-urile blocate includ apeluri către funcții periculoase Python (`os.system(...)`, `subprocess.`), comenzi inline (`;rm`, `;wget`, `;curl`, `;chmod`, `;sudo`, `;bash`, `;python`, `;node`, `;exec`), substituții de shell (backticks, `$(...)`). Aceste reguli sunt verificate prin regex compiled cu multiline mode."),
  p("Patch-urile rejectate sunt înregistrate în auditul Apply Fix cu acțiunea „reject\" și motivul exact al respingerii, oferind un audit trail complet și pentru încercările eșuate."),

  h2("4.5. Logging structurat fără date sensibile"),
  p("Întreaga aplicație folosește modulul `logging` standard al Python pentru toate mesajele — niciun `print()` în cod. Format-ul mesajelor include timestamp, nume modul, nivel și mesaj, configurat în `config.py`. Niciun secret nu apare vreodată în log-uri: API keys (CLAUDE_API_KEY), credențiale OAuth (WHOOP_CLIENT_SECRET), codurile OAuth de autorizare, sau tokenii de acces. Erorile din apelurile Claude sunt logate cu nivelul ERROR, iar excepțiile au try/except cu fallback la responses pre-cached — niciodată un crash silent."),

  h2("4.6. OAuth 2.0 pentru WHOOP"),
  p("Autentificarea cu WHOOP folosește fluxul OAuth 2.0 standard. Endpoint-ul `/api/whoop/auth` generează un parametru `state` aleator și de unică folosință (prin `secrets`), pe care `/api/whoop/callback` îl validează și îl consumă — protecție CSRF reală, nu o constantă cunoscută. Scope-urile cerute includ `offline`, obligatoriu pentru ca WHOOP să emită un refresh token (fără el conexiunea ar muri după ~1h). Schimbarea codului pe token, refresh-ul tokenului expirat (cu marjă de 60 de secunde și re-trimiterea scope-ului `offline`) și persistarea token-urilor în `.whoop_tokens.json` (gitignored, reîncărcat automat la pornire) sunt gestionate de clasa `BiometricEngine`."),

  h2("4.7. SQLite cu prepared statements"),
  p("Toate query-urile SQL folosesc parameter binding cu caracterul `?` și argumente separate, niciodată concatenare de string-uri sau formatare cu f-strings. Acest pattern elimină complet clasa de vulnerabilități SQL injection. Funcțiile din `persistence/db.py` sunt pure în sensul că primesc input-uri tipizate și produc query-uri parametrizate — nu există funcții care construiesc dinamic SQL din input neîncrezut. În plus, PRAGMA `journal_mode=WAL` oferă citiri concurente non-blocking, util pentru istoricul cerut de UI în timp ce thread-urile scriu sample-uri biometrice."),

  h2("4.8. Endpoint-uri locale privilegiate (token + Origin + workspace)"),
  p("Capabilitățile reale noi — terminal, fișiere, LSP, completări inline — expun shell adevărat, scriere pe disc și subprocese pe localhost. Fără apărare, orice pagină web deschisă în browserul utilizatorului ar putea face WebSocket către `localhost` și obține un shell. Trei straturi previn asta. Întâi, backend-ul ascultă implicit doar pe `127.0.0.1` — fără expunere în LAN. Al doilea, fiecare handshake WebSocket verifică antetul Origin față de `ALLOWED_ORIGINS`; browserele trimit întotdeauna Origin și JS nu îl poate falsifica, deci un site malițios este respins (CORS nu acoperă WebSocket-urile)."),
  p("Al treilea, un token de sesiune generat per-proces (`secrets.token_urlsafe`) este citit o singură dată din `/api/session` — răspuns pe care CORS îl face necitibil de către alte origini, deci doar aplicația legitimă îl obține — și atașat la fiecare apel privilegiat: ca parametru `?token=` pentru WebSocket-uri (browserele nu pot seta antete pe conexiunile WS) și ca antet `X-DevLife-Token` pentru HTTP. În plus, funcția `resolve_in_workspace()` rezolvă orice cale și garantează că rămâne sub `WORKSPACE_ROOT`, blocând și symlink-urile care ar încerca să iasă. Pe deploy găzduit, toate aceste funcții se opresc prin flag-urile `TERMINAL_ENABLED` / `FILES_ENABLED` / `LSP_ENABLED` / `INLINE_AI_ENABLED`, lăsând activ doar nucleul de companion biometric."),
);

// ====== 5. INSTALARE ======
children.push(
  h1("5. Ghid de instalare și configurare"),

  h2("5.1. Cerințe sistem"),
  bullet("Python 3.11+ (testat pe 3.11.9 și 3.14)"),
  bullet("Node.js 18+ și npm pentru frontend"),
  bullet("git pentru clonare repo"),
  bullet("Chrome (recent) pentru Web Bluetooth API — necesar doar pentru BPM live"),
  bullet("opțional: ceas WHOOP cu cont activ pentru date reale"),
  bullet("opțional: cont Anthropic cu API key pentru Claude online"),

  h2("5.2. Instalare locală"),
  code("git clone https://github.com/amarieidavid26-byte/devlife.git\ncd devlife\n./scripts/setup.sh   # creează venv, instalează deps Python + npm"),
  p("Script-ul `setup.sh` creează virtual environment-ul Python, instalează toate dependințele din `requirements.txt`, intră în folderul `frontend/` și rulează `npm install`."),

  h2("5.3. Variabile de mediu (.env)"),
  p("Pentru rulare locală minimă (fără hardware/API), un singur `.env` în rădăcină este suficient:"),
  code("GAME_MODE=True\nDEMO_OFFLINE=true\nPORT=8000"),
  p("Pentru rulare cu API keys reale:"),
  code("CLAUDE_API_KEY=sk-ant-...\nWHOOP_CLIENT_ID=...\nWHOOP_CLIENT_SECRET=...\nWHOOP_REDIRECT_URI=http://localhost:8000/api/whoop/callback\nALLOWED_ORIGINS=http://localhost:5173\nGAME_MODE=True\nPORT=8000"),

  h2("5.4. Rularea aplicației"),
  code("./scripts/dev.sh   # pornește backend pe :8000 + frontend pe :5173"),
  p("Verificare rapidă a backend-ului:"),
  code("curl http://localhost:8000/health   # {\"status\":\"alive\",\"ghost\":\"watching\"}\ncurl http://localhost:8000/ready    # {\"ready\":true,...}\npython3 -m pytest tests/ -q          # 71 passed"),
  screenshot(21, "Terminal cu output-ul `./scripts/dev.sh` arătând backend pornit pe port 8000 și frontend Vite pe 5173."),

  h2("5.5. Deployment pe Railway"),
  p("Deployment-ul automat se face din rădăcina repo-ului prin fișierul `Procfile`:"),
  code("web: uvicorn server:app --host 0.0.0.0 --port $PORT"),
  p("Fișierul `runtime.txt` specifică versiunea Python:"),
  code("python-3.11.9"),
  p("Variabilele de mediu necesare (CLAUDE_API_KEY, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI cu domeniul Railway, ALLOWED_ORIGINS) se setează din dashboard-ul Railway. Deployment-ul se declanșează automat la fiecare push pe ramura `main`. Healthcheck-ul Railway folosește endpoint-ul `/ready` care returnează 503 când dependințele critice (CLAUDE_API_KEY) lipsesc și `DEMO_OFFLINE` nu este activ — un signal explicit că aplicația nu este pregătită să servească trafic."),
  screenshot(22, "Railway dashboard cu deployment-ul DevLife în stare „Active\" și URL-ul public vizibil."),
);

// ====== 6. JUSTIFICAREA TEHNOLOGIILOR ======
children.push(
  h1("6. Justificarea folosirii tehnologiilor alese"),

  h3("Python + FastAPI"),
  p("Python a fost ales ca limbaj de backend pentru ecosistemul său dominant în domeniile relevante pentru DevLife. SDK-ul oficial Anthropic este disponibil prima dată în Python, biblioteca scipy oferă unelte avansate pentru analiza HRV și statistici biometrice, ImageHash permite deduplicarea screenshot-urilor în modul desktop, iar httpx oferă un client HTTP modern compatibil cu async/await pentru integrarea cu WHOOP API. FastAPI a fost ales ca framework web pentru patru caracteristici decisive: validarea automată Pydantic pe toate endpoint-urile (returnează automat 422 cu detalii la payload-uri invalide), suport nativ pentru WebSocket fără biblioteci adiționale (esențial pentru actualizările biometrice cu latență mică), integrarea naturală async/await cu thread-uri pentru lucrul CPU-bound, și type hints care fac codul self-documenting și verificabil static. Alternativele considerate au fost respinse: Flask ar fi necesitat extensii pentru fiecare caracteristică, Django era prea greoi pentru un API simplu, Node.js + Express ar fi pierdut accesul direct la ecosistemul AI Python."),

  h3("PixiJS"),
  p("PixiJS 7 a fost ales pentru randarea camerei izometrice procedurale și a HUD-ului biometric. Este o bibliotecă WebGL hardware-accelerată minimalistă (aproximativ 50KB minified), fără opinii arhitecturale impuse asupra modului de organizare a aplicației. Această neutralitate a permis construirea camerei izometrice procedural — fără sprite sheets pentru elementele core — folosind doar primitive grafice (Graphics, Container, Sprite). Three.js a fost considerat și respins pentru că oferă un model 3D complet, excesiv pentru o aplicație 2.5D care nu folosește profunzime reală. Phaser a fost considerat și respins pentru că impune un model de joc cu loop și entități care ar fi adăugat complexitate fără beneficii. Random precision pe ecrane retina este obținută prin `resolution: window.devicePixelRatio || 1` la inițializarea aplicației Pixi."),

  h3("SQLite"),
  p("SQLite a fost ales pentru persistență pentru trei motive concrete. Primul este zero overhead de deployment — nu există un proces server separat de pornit, monitorizat sau actualizat; baza de date este un fișier portabil. Al doilea este conformitatea ACID completă combinată cu modul WAL (Write-Ahead Logging), care permite citiri concurente non-blocking în timp ce se fac scrieri. Această caracteristică este esențială pentru aplicația noastră: thread-ul biometric scrie continuu sample-uri, dar utilizatorul poate cere istoricul de intervenții prin endpoint-ul `/api/history` în orice moment fără să blocheze nimic. Al treilea motiv este portabilitatea — fișierul `.db` poate fi copiat pe orice mașină pentru debugging sau inspecție cu DB Browser for SQLite. Pentru volumul estimat de aproximativ 500 inserts pe oră ai unui utilizator activ, complexitatea PostgreSQL ar fi fost o decizie greșită."),

  h3("Claude API (Anthropic Sonnet 4)"),
  p("Claude Sonnet 4 a fost ales pentru capacitatea de top tier în reasoning și analiză de cod, returnarea consistentă a JSON-ului structurat (fără brackets lipsă sau câmpuri neașteptate), suport pentru system prompts diferențiate per context (cinci prompts distincte pentru cele cinci stări cognitive în GhostBrain, cinci prompts dedicate pentru cele cinci aplicații in-game în ContentAnalyzer), și cost per token acceptabil pentru un proiect deschis. Alternativele considerate au fost GPT-4o (mai scump și mai puțin consistent pe JSON), Gemini (mai puțin matur la momentul deciziei), modele open-source self-hosted (latență prohibitivă pentru un experiment de UX). SDK-ul oficial Anthropic oferă timeout integrat, retry built-in, și type hints — clientul este instanțiat cu `timeout=15.0s` în două locuri (GhostBrain și ContentAnalyzer) pentru a preveni blocarea thread-urilor."),

  h3("WHOOP API + Chrome Web Bluetooth"),
  p("Soluția biometrică combină WHOOP API pentru date agregate (recovery, strain, sleep performance, HRV trends) cu Chrome Web Bluetooth pentru BPM live (Heart Rate Service standard BLE). WHOOP API a fost ales pentru calitatea datelor agregate — recovery-ul WHOOP folosește un algoritm validat clinic care combină HRV, RHR și sleep — și pentru OAuth 2.0 standardizat. Limitarea WHOOP API este lipsa BPM-ului în timp real: API-ul reîmprospătează datele aproximativ la 5 minute. Pentru cazurile de utilizare care necesită date live (sleep mode automat la HR < 50 BPM, validarea stărilor de stres acut), banda WHOOP transmite caracteristica standard BLE Heart Rate Service, accesibilă prin Chrome Web Bluetooth API direct din browser. Trade-off-ul acceptat este că BLE necesită Chrome și pairing inițial — acceptabil pentru publicul țintă (dezvoltatori). Logica de prioritate dezactivează automat manual override-ul (hotbar 1-5 pentru schimbarea mock a stărilor) când BLE este activ, prevenind coliziuni între datele reale și cele simulate."),

  h3("Claude Vision API (pentru desktop mode)"),
  p("Pentru `GAME_MODE=False`, screenshot-urile desktop-ului real sunt trimise către Claude Vision. Avantajul este că funcționează cu workflow-ul real al utilizatorului — orice IDE, orice terminal, orice browser. Dezavantajul este costul de token-uri mai mare (analiza unei imagini consumă mai mulți token-uri decât analiza unui text echivalent). Pentru a mitiga această problemă, modulul `screen_capture.py` folosește ImageHash pentru deduplicare: dacă două capturi consecutive au hash perceptual similar (sub un prag configurabil), a doua nu este trimisă. Polling-ul este configurabil și se adaptează stării cognitive — în DEEP_FOCUS intervalul crește la 10 secunde pentru a evita interogări inutile."),

  h3("Monaco Editor"),
  p("Monaco Editor a fost ales pentru aplicația CodeEditor in-game pentru că este același editor folosit în Visual Studio Code — sintaxă highlight, autocomplete, multi-cursor, suport pentru zeci de limbaje — dar embeddable în pagina web. Este acum împachetat local ca ESM (nu mai este încărcat de pe CDN), ceea ce face IDE-ul să funcționeze complet offline și permite înregistrarea de provideri proprii pentru completări inline AI și pentru LSP. Alternativa CodeMirror 6 ar fi fost mai ușoară ca payload, dar Monaco oferă out-of-the-box experiența de IntelliSense identică cu VS Code, esențială pentru ca editorul din joc să fie un IDE real, nu o jucărie."),

  h3("xterm.js + PTY (terminal real)"),
  p("Pentru terminalul real, xterm.js a fost ales pe frontend pentru că este același emulator de terminal din VS Code — gestionează corect secvențele ANSI, aplicațiile full-screen și redimensionarea. Pe backend, modulul `pty` din biblioteca standard Python a fost preferat în locul unor dependențe externe (ptyprocess, pexpect, node-pty): oferă acces direct la pseudo-terminal fără dependențe terțe și fără un sidecar Node. Combinația dă un shell autentic în browser, peste un singur WebSocket binar."),

  h3("Claude Haiku 4.5 (completări inline)"),
  p("Pentru completările inline de tip Cursor a fost ales Claude Haiku 4.5, nu Sonnet 4: la ghost-text contează latența, nu reasoning-ul profund, iar Haiku este semnificativ mai rapid și mai ieftin pentru output scurt. Astfel, cele două căi AI folosesc modelul potrivit fiecărei sarcini — Sonnet pentru intervențiile Ghost (analiză și decizie), Haiku pentru completări (viteză). Promptul de tip fill-in-the-middle, `max_tokens` mic, stop sequences și streaming-ul mențin latența cât mai jos posibil pe un API găzduit."),

  h3("pyright / typescript-language-server (LSP)"),
  p("Pentru inteligența de limbaj au fost alese servere LSP standard, mature: pyright (Microsoft) pentru Python și typescript-language-server pentru JS/TS. Reutilizarea protocolului LSP înseamnă diagnostice, completare și hover de calitate de producție fără a reimplementa analiza de limbaj. Puntea este pură Python (`asyncio.create_subprocess_exec` + framing JSON-RPC), fără un bridge Node, fiindcă backend-ul este deja Python. Serverele sunt opționale: dacă lipsesc, editorul degradează grațios."),

  h3("Howler"),
  p("Howler a fost ales ca bibliotecă audio pentru Web Audio API pentru cross-browser compatibility și API-ul simplu. Gestionează muzica ambientală (când și dacă este disponibilă) și efectele Ghost-ului. Alegerea unei biblioteci dedicate, nu a Web Audio API direct, permite gestiunea elegantă a load error-ilor — dacă fișierul ambient lipsește, Howler raportează printr-un callback `onloaderror` și aplicația continuă silent fără să cadă. Volum master este controlabil din Settings și persistat în localStorage."),

  h3("slowapi"),
  p("Slowapi a fost ales pentru rate limiting pentru că este compatibil direct cu pattern-ul FastAPI Limiter, are aproximativ 100 de linii de cod și niciun dependency heavy. Decoratorul declarativ `@limiter.limit(\"30/minute\")` aplicat pe endpoint-ul `/api/biometric/mock` previne flooding-ul (acest endpoint este apelat de hotbar-ul 1-5 și ar putea fi abuzat). Răspunsul la depășire este HTTP 429 cu un body JSON descriptiv."),
);

// ====== 7. OPINII AUTORI ======
children.push(
  h1("7. Opinia autorilor și utilitate concretă"),

  h2("7.1. Opinia lui David Amariei"),
  p("Am început proiectul ca un experiment personal — voiam să văd dacă pot lega ceasul meu WHOOP la un editor de cod. Prima dată când am văzut Ghost-ul reacționând la HRV-ul meu în timp real, am realizat că nu este doar un gimmick. Este un mecanism de feedback care nu exista până acum: aplicația știe ce simt eu, nu doar ce fac eu. Camera izometrică și Ghost-ul AI sunt acolo pentru că, fără o componentă vizuală captivantă, nimeni nu va lăsa aplicația deschisă timp de ore întregi. Cu ele, DevLife devine ceva ce vrei să ai pe ecran — un companion, nu un instrument. Partea cea mai surprinzătoare pentru mine a fost că funcționează în ambele direcții: când plantul meu virtual a început să se ofilească după mai multe sesiuni FATIGUED, am ajuns să mă duc la culcare mai devreme. Software-ul îmi schimbase comportamentul prin feedback vizual subtil."),

  h2("7.2. Opinia lui Matei Vultur"),
  p("Când am preluat backend-ul, am găsit un prototip funcțional dar fragil — globale împrăștiate, fără teste, callback-ul OAuth WHOOP rupt, niciun control de securitate. L-am refactorizat sistematic, fără să schimb produsul: am încapsulat tot state-ul într-un `AppState` dataclass, am adăugat validare Pydantic, am construit persistența SQLite, am scris auditul pentru Apply Fix. Cele 71 de teste pytest au apărut pentru că într-un sistem cu intervenții AI care propun modificări de cod, fiecare path critic trebuie verificat — un bug în validatorul de patch ar putea însemna executarea de cod arbitrar. Felul în care biometricele utilizatorului se transformă în intervenții AI cu rollback complet — acesta este scheletul pe care DevLife poate construi mai departe. Pentru un dezvoltator care lucrează singur în nopți târzii, este diferența între un `git push --force` regretabil și un Save Draft. Acest decalaj este, pe termen lung, ceea ce face diferența între un produs care „arată bine\" și unul care chiar contează."),

  h2("7.3. Exemplu concret de utilizare"),
  p("Este ora 1:30 dimineața. Dezvoltatorul are recovery 31% (sub baseline-ul personal de 65%). HRV-ul a scăzut la 28ms de la 52ms baseline. A scris cod timp de patru ore consecutive fără pauză, frustrat după un bug greu. Deschide terminal-ul și tastează:"),
  code("git reset --hard origin/main"),
  p("Înainte să apese Enter, Ghost-ul afișează:"),
  pRich([
    { text: "FATIGUE FIREWALL", bold: true, color: "E94560" },
    " — HRV 28ms (baseline 52). Recovery 31%. ",
    { text: "git reset --hard", italic: true },
    " șterge modificările necomise. Ai lucrat 4 ore. Probabil sunt acolo schimbări care nu mai pot fi recuperate.",
  ]),
  p("Mesajul este însoțit de trei butoane: „Salvează Draft\" (acțiunea preferată, care face un commit + amend mâine cu mintea limpede), „Fă-o Oricum\" (escape valve pentru cazuri legitime), „Amintește-mi mai târziu\" (suprimare temporară 10 secunde). În testarea internă (alpha martie-aprilie 2026), în 7 din 10 cazuri dezvoltatorul a ales „Salvează Draft\". A doua zi, cu mintea limpede, a văzut că acele schimbări aveau valoare. Aceasta este diferența concretă pe care DevLife o produce: nu un avertisment generic, ci o pauză de o secundă care permite reflecție."),
);

// ====== 8. CONCLUZII ======
children.push(
  h1("8. Concluzii și dezvoltări viitoare"),

  h2("8.1. Provocări întâlnite și soluții"),
  p("Prima provocare semnificativă a fost că WHOOP API nu transmite BPM live — interogările au refresh interval relativ lung. Pentru cazurile de utilizare care necesită reactivitate (sleep mode, detecția stresului acut), soluția a fost combinarea WHOOP API pentru date agregate cu Chrome Web Bluetooth direct la banda WHOOP pentru BPM live. Această dualitate a necesitat o logică de prioritate (BLE override-uiește WHOOP când e proaspăt) și un mecanism de dezactivare automată a manual override-ului când datele live curg."),
  p("A doua provocare a fost state sharing-ul între thread-urile daemon (biometric, ghost) și event loop-ul asyncio (WebSocket broadcast). Soluția a fost un dataclass `AppState` centralizat care încapsulează tot state-ul partajat, plus folosirea `asyncio.run_coroutine_threadsafe()` pentru marshaling-ul broadcast-urilor din thread-uri non-async către event loop. Această decizie a costat o refactorizare semnificativă a prototipului inițial, dar a eliminat o clasă întreagă de bug-uri legate de race condition-uri."),
  p("A treia provocare a fost siguranța patch-urilor propuse de AI. Un model lingvistic poate genera cod arbitrar, inclusiv cod malițios — directly applying-ul este inacceptabil. Soluția a fost stack-ul complet Apply Fix: Pydantic contract pentru shape, validator pentru reguli (max linii, fără shell metacharacters, rationale obligatoriu), preview UI pentru confirmare explicită, audit log pentru trasabilitate, rollback obligatoriu. Această soluție este standard enterprise pentru SOC compliance, dar a fost esențială pentru a putea propune cu încredere modificări AI utilizatorului."),
  p("A patra provocare a fost asigurarea că demo-ul live funcționează indiferent de condițiile de rețea. Soluția a fost flag-ul `DEMO_OFFLINE=true` care forțează toate apelurile externe să fie mock-uite cu seed determinist, plus un banner explicit „Mod degradat\" pentru transparență. Demo-ul rulează identic cu sau fără internet."),
  p("A cincea provocare a fost concurența la SQLite când mai multe thread-uri scriu și un endpoint citește. Soluția a fost activarea modului WAL (Write-Ahead Logging) prin PRAGMA, care permite citiri non-blocking concurente cu scrieri."),
  p("A șasea provocare a fost curățarea fișierelor audio cu drepturi de autor neclare. Inițial codul referea un fișier MP3 ambient cu proveniența incertă. Soluția a fost înlocuirea completă cu sinteză procedurală prin Web Audio API în `SoundManager.js` — niciun fișier audio extern nu mai este necesar."),

  h2("8.2. Roadmap pe termen scurt"),
  p("Față de versiunea v1.1, iterația curentă a transformat trei funcționalități din simulate în reale: conexiunea WHOOP cu persistența corectă a tokenului, editorul care editează fișiere reale (IDE complet cu Monaco bundle-uit, file tree, taburi, salvare), terminalul prin PTY real, plus completări AI inline (Haiku) și inteligență de limbaj prin LSP (pyright/tsserver). Roadmap-ul de mai jos privește pașii următori peste această fundație."),
  bullet("Migrare TypeScript pentru frontend — siguranță tip + autocomplete mai bun"),
  bullet("Integrare Garmin și Apple Watch ca alternative la WHOOP"),
  bullet("Preset-uri biometrice pentru profile speciale (sportivi, persoane cu apnee)"),
  bullet("Expanded Fatigue Firewall (AWS CLI patterns, Kubernetes, Terraform)"),
  bullet("Apply Fix multi-file (actualmente este single-file, range constrained)"),

  h2("8.3. Roadmap pe termen mediu"),
  bullet("Versiune mobile companion (iOS/Android) cu push notifications"),
  bullet("Extensii native pentru VS Code și JetBrains IDEs"),
  bullet("Cloud sync opțional pentru istoric (cu E2E encryption)"),
  bullet("Team mode — manager sau lead vede vedere agregată a stărilor echipei (cu consimțământ explicit)"),

  h2("8.4. Roadmap pe termen lung"),
  bullet("Modele ML antrenate pe date proprii — clasificator personalizat per utilizator"),
  bullet("Integrare cu calendar — Ghost știe că ai meeting în 30 minute"),
  bullet("Context biometric integrat în code review GitHub/GitLab"),
  spacer(),
  pRich([
    { text: "Out of scope (decis explicit să NU facem):", bold: true },
  ]),
  bullet("Multiplayer / social features — incompatibil cu safety-first focus"),
  bullet("Monetizare prin date — incompatibil cu principiile de privacy"),
  bullet("Gamification cu leaderboard pe biometrice — psihologic nesănătos"),
);

// ====== 9. TESTIMONIALE ======
children.push(
  h1("9. Testimoniale"),
  p("Următoarele testimoniale au fost colectate informal în faza alpha (martie-aprilie 2026) de la utilizatori beta. Pentru lansarea publică, autorii vor colecta sistematic feedback prin formular dedicat."),
  spacer(),
  quote(
    "Am rulat DevLife o săptămână în faza alpha. Când mi-a blocat un rm -rf la 11 PM într-o seară când HRV-ul meu era praf, am realizat că aplicația chiar funcționează. M-am dus la culcare.",
    "A.M., student informatică, beta tester",
  ),
  quote(
    "Camera izometrică m-a făcut să o las deschisă. Dacă era doar un dashboard, o închideam. Faptul că Ghost-ul are personalitate per stare e ce face diferența.",
    "R.P., dezvoltator freelance, beta tester",
  ),
  quote(
    "Am verificat patch-urile pe care le propune Ghost-ul — sunt sub-optimale uneori, dar previzualizarea și rollback fac ca să nu te temi să apeși Apply Fix. Aceasta este cheia.",
    "D.I., student informatică, beta tester",
  ),
  quote(
    "Avem în echipa noastră un on-call rotation. Am sugerat să testăm DevLife pe membrii care au tura de noapte — dacă poate preveni un singur incident în producție, s-a plătit deja.",
    "C.S., SRE lead, early reviewer",
  ),
);

// ====== 10. RESURSE EXTERNE ======
children.push(
  h1("10. Resurse externe și licențe"),

  h2("10.1. Biblioteci și framework-uri"),
  p("Toate bibliotecile sunt licențiate sub MIT, BSD sau Apache (licențe permisive). Versiunile exacte sunt fixate în `requirements.txt` (Python) și `frontend/package.json` (Node)."),
  bullet("FastAPI 0.133+ — framework web Python (MIT)"),
  bullet("Pydantic 2.12+ — validare prin type hints (MIT)"),
  bullet("Uvicorn 0.41+ — server ASGI (BSD)"),
  bullet("Anthropic Python SDK 0.83+ — client oficial Claude API (MIT)"),
  bullet("httpx 0.28+ — client HTTP async (BSD)"),
  bullet("scipy 1.17+ — analiză HRV (BSD)"),
  bullet("ImageHash 4.3+ — deduplicare screenshots (BSD)"),
  bullet("mss 10.1+ — captură ecran cross-platform (MIT)"),
  bullet("slowapi 0.1.9+ — rate limiting (MIT)"),
  bullet("python-dotenv 1.2+ — encărcare .env (BSD)"),
  bullet("PixiJS 7.x — render WebGL 2D (MIT)"),
  bullet("Monaco Editor — editor de cod (MIT)"),
  bullet("Howler.js — audio (MIT)"),
  bullet("Vite — bundler / dev server (MIT)"),

  h2("10.2. Servicii externe (API-uri)"),
  bullet("Anthropic Claude API (Claude Sonnet 4) — declarată în README.md, folosită prin SDK oficial, sub ToS Anthropic"),
  bullet("WHOOP API (OAuth 2.0) — declarată în README.md, folosită prin OAuth standard, sub ToS WHOOP"),
  bullet("Chrome Web Bluetooth API — caracteristică standard a browser-ului Chrome"),

  h2("10.3. Resurse grafice și fonturi"),
  bullet("Kenney.nl Furniture Kit 2.0 — sprite-uri izometrice (licență CC0 1.0, domeniu public). Dovada în public/assets/License.txt"),
  bullet("Sprite-uri în 4 orientări (NE/NW/SE/SW) pentru: mobilier dormitor (paturi, dulapuri, măsuțe), birou (scaune, mese, monitoare), baie (cabinete, oglinzi, chiuvete, căzi), decor (plante, lămpi, animale plush)"),
  bullet("Font Fredoka — Google Fonts, SIL Open Font License 1.1"),
  bullet("Font Nunito — Google Fonts, SIL Open Font License 1.1"),

  h2("10.4. Audio și sunet"),
  p("Niciun fișier audio extern nu este inclus în repository. Toate sunetele aplicației — efectele de UI, ambientul Ghost-ului, drone-urile per stare — sunt sintetizate procedural prin Web Audio API în modulul `SoundManager.js`. Această decizie a fost luată deliberat după ce un fișier MP3 cu proveniență incertă a fost îndepărtat dintr-o iterație anterioară. Headerul fișierului `SoundManager.js` declară explicit: „all sounds are synthesized with web audio api — no external audio files needed\"."),

  h2("10.5. Cod sursă extern"),
  p("Niciun fragment de cod copiat din surse externe nedeclarate nu este prezent în repo. Părți din cod au fost scrise cu asistența Claude AI (Anthropic) în sesiuni de pair-programming, în special pentru refactorizarea backend-ului (modulul AppState, persistence layer, security), suita de teste (structura fixtures, mock-uri) și documentație (rubric matrix, playbook-uri, runbook-uri). Această utilizare este declarată explicit în `docs/authorship.md`. Toate deciziile arhitecturale, design-ul algoritmului de clasificare biometrică, design-ul UX al camerei izometrice și al scenelor exterioare, integrarea WHOOP BLE — sunt originale. Toate sugestiile AI au fost integrate manual după review uman."),
);

// ====== BUILD DOCUMENT ======

const doc = new Document({
  creator: "David Amariei & Matei Vultur",
  title: "Documentația DevLife — InfoEducație 2026",
  description: "Documentația completă a proiectului DevLife pentru secțiunea Software Utilitar",
  styles: {
    default: {
      document: { run: { font: FONT, size: TEXT_SIZE } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: HEADING1_SIZE, bold: true, font: FONT, color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 0, after: 320 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: HEADING2_SIZE, bold: true, font: FONT, color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: HEADING3_SIZE, bold: true, italics: true, font: FONT, color: COLOR_TERTIARY },
        paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
        titlePage: true, // header/footer separat pe prima pagina (coperta)
      },
      headers: {
        first: new Header({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "DevLife", bold: true, size: 18, font: FONT, color: COLOR_PRIMARY }),
                new TextRun({ text: "  ·  InfoEducație 2026", size: 18, font: FONT, color: COLOR_MUTED, italics: true }),
              ],
            }),
            new Paragraph({
              spacing: { before: 0, after: 0 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 1 } },
              children: [new TextRun({ text: "", size: 2 })],
            }),
          ],
        }),
      },
      footers: {
        first: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
        default: new Footer({
          children: [
            new Paragraph({
              spacing: { before: 0, after: 80 },
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 1 } },
              children: [new TextRun({ text: "", size: 2 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "David Amariei & Matei Vultur", size: 18, font: FONT, color: COLOR_MUTED }),
                new TextRun({ text: "   ·   ", size: 18, font: FONT, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 18, font: FONT, color: COLOR_PRIMARY }),
                new TextRun({ text: " / ", size: 18, font: FONT, color: COLOR_MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: FONT, color: COLOR_MUTED }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(__dirname, "..", "..", "documentatie-finala.docx");
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Generated: ${outPath}`);
  console.log(`  Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
