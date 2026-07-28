// Generator pentru documentatie-finala.docx: parseaza docs/documentatie.md
// (fisier local, negit) si il randeaza cu identitatea vizuala existenta.

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
} = require("docx");

// ====== CONSTANTE TIPOGRAFICE ======

// Arial = font universal compatibil cu Google Docs (Calibri se substituie la import)
const FONT = "Arial";
const MONO = "Consolas"; // Google Docs il mapeaza la Courier New
const TEXT_SIZE = 22; // 11pt
const HEADING1_SIZE = 40; // 20pt
const HEADING2_SIZE = 30; // 15pt
const HEADING3_SIZE = 26; // 13pt
const HEADING4_SIZE = 24; // 12pt
const HEADING5_SIZE = 22; // 11pt

const COLOR_PRIMARY = "1F3864";    // navy inchis: H1, header tabel
const COLOR_SECONDARY = "2E74B5";  // albastru mediu: H2, bare laterale
const COLOR_TERTIARY = "548DD4";   // albastru deschis: H3, H4
const COLOR_MUTED = "888888";      // gri: header/footer/captions
const COLOR_QUOTE = "5A5A5A";      // gri inchis: citate
const COLOR_CODE_BG = "F2F4F7";    // gri foarte deschis: fundal cod
const COLOR_CODE_TEXT = "1A1A2E";  // navy aproape negru: text cod

// ====== SURSA ======

const SRC = path.join(__dirname, "..", "..", "docs", "documentatie.md");
if (!fs.existsSync(SRC)) {
  console.error("EROARE: docs/documentatie.md lipseste (fisier local, negit). Ruleaza generatorul pe masina cu documentatia.");
  process.exit(1);
}
const srcLines = fs.readFileSync(SRC, "utf8").split(/\r?\n/);

// ====== TOKENIZER INLINE ======

// Span-urile de cod se extrag primele; delimitatorul are lungime variabila
// (1, 2 sau 4 backticks in sursa), inchis de o serie de exact aceeasi lungime.
function splitCodeSpans(text) {
  const parts = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") { plain += text[i]; i++; continue; }
    let n = 1;
    while (text[i + n] === "`") n++;
    let j = i + n;
    let close = -1;
    while (j < text.length) {
      if (text[j] !== "`") { j++; continue; }
      let m = 1;
      while (text[j + m] === "`") m++;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close === -1) { plain += text.slice(i, i + n); i += n; continue; }
    let content = text.slice(i + n, close);
    // CommonMark: un spatiu de fiecare parte se elimina daca ambele exista
    if (content.length >= 2 && content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "") {
      content = content.slice(1, -1);
    }
    if (plain) { parts.push({ code: false, text: plain }); plain = ""; }
    parts.push({ code: true, text: content });
    i = close + n;
  }
  if (plain) parts.push({ code: false, text: plain });
  return parts;
}

function italicTokens(text, bold) {
  const out = [];
  let last = 0;
  const re = /\*([^*]+)\*/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold });
    out.push({ text: m[1], bold, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold });
  return out;
}

function tokenize(text, lineNo) {
  const tokens = [];
  // starea bold traverseaza span-urile de cod: **a `b` c** e valid in sursa
  let bold = false;
  for (const part of splitCodeSpans(text)) {
    if (part.code) { tokens.push({ text: part.text, code: true, bold }); continue; }
    part.text.split("**").forEach((seg, idx) => {
      if (idx > 0) bold = !bold;
      if (seg) tokens.push(...italicTokens(seg, bold));
    });
  }
  if (bold) console.warn(`AVERTISMENT linia ${lineNo}: marcaj ** neinchis`);
  const clean = tokens.filter(t => t.text.length > 0);
  for (const t of clean) {
    if (!t.code && /\*\*|`|\]\(/.test(t.text)) {
      console.warn(`AVERTISMENT linia ${lineNo}: marcaj markdown neprelucrat in "${t.text.slice(0, 60)}"`);
    }
  }
  return clean;
}

function plainLength(tokens) {
  return tokens.reduce((a, t) => a + t.text.length, 0);
}

// ====== PARSER DE BLOCURI ======

function isBlockStart(line) {
  return /^#{1,6} /.test(line) || /^```/.test(line) || /^\|/.test(line) ||
    /^>/.test(line) || /^---\s*$/.test(line) || /^- /.test(line) || /^\d+\. /.test(line);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
}

// Liniile scurte dintr-un blockquote sunt intreruperi intentionate (mesajul
// FIREWALL); liniile lungi sunt wrap la ~100 coloane si se unesc cu spatiu.
function joinQuoteLines(lines) {
  const visual = [];
  for (const ln of lines) {
    if (visual.length > 0 && visual[visual.length - 1].length >= 60) {
      visual[visual.length - 1] += " " + ln;
    } else {
      visual.push(ln);
    }
  }
  return visual;
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const content = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { content.push(lines[i]); i++; }
      if (i >= lines.length) console.warn(`AVERTISMENT linia ${lineNo}: bloc de cod neinchis`);
      i++;
      blocks.push({ type: "code", lang, content, lineNo });
      continue;
    }

    const hm = /^(#{1,6}) (.*)$/.exec(line);
    if (hm) {
      if (hm[1].length > 5) console.warn(`AVERTISMENT linia ${lineNo}: heading de nivel ${hm[1].length}, neasteptat`);
      blocks.push({ type: "heading", level: hm[1].length, text: hm[2].trim(), lineNo });
      i++;
      continue;
    }

    if (/^\|/.test(line)) {
      const raw = [];
      while (i < lines.length && /^\|/.test(lines[i])) { raw.push({ text: lines[i], lineNo: i + 1 }); i++; }
      if (raw.length < 2 || !/^\|[\s:|-]+\|?\s*$/.test(raw[1].text)) {
        console.warn(`AVERTISMENT linia ${lineNo}: tabel fara rand delimitator, emis ca text simplu`);
        for (const r of raw) blocks.push({ type: "para", text: r.text, lineNo: r.lineNo });
        continue;
      }
      const header = splitTableRow(raw[0].text);
      const aligns = splitTableRow(raw[1].text).map(c => {
        if (/^:-+:$/.test(c)) return AlignmentType.CENTER;
        if (/^-+:$/.test(c)) return AlignmentType.RIGHT;
        return AlignmentType.LEFT;
      });
      const rows = raw.slice(2).map(r => {
        const cells = splitTableRow(r.text);
        if (cells.length !== header.length) {
          console.warn(`AVERTISMENT linia ${r.lineNo}: rand de tabel cu ${cells.length} celule, antetul are ${header.length}`);
          while (cells.length < header.length) cells.push("");
          cells.length = header.length;
        }
        return { cells, lineNo: r.lineNo };
      });
      blocks.push({ type: "table", header, aligns, rows, lineNo });
      continue;
    }

    if (/^>/.test(line)) {
      const qlines = [];
      while (i < lines.length && /^>/.test(lines[i])) { qlines.push(lines[i].replace(/^> ?/, "")); i++; }
      blocks.push({ type: "quote", lines: joinQuoteLines(qlines), lineNo });
      continue;
    }

    if (/^---\s*$/.test(line)) {
      // fiecare separator preceda un capitol cu page break propriu, nu se randeaza
      blocks.push({ type: "hr", lineNo });
      i++;
      continue;
    }

    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        const itemLine = i + 1;
        let text = lines[i].slice(2);
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !isBlockStart(lines[i])) {
          text += " " + lines[i].trim();
          i++;
        }
        items.push({ text, lineNo: itemLine });
      }
      blocks.push({ type: "ul", items, lineNo });
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const itemLine = i + 1;
        let text = lines[i].replace(/^\d+\. /, "");
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !isBlockStart(lines[i])) {
          text += " " + lines[i].trim();
          i++;
        }
        items.push({ text, lineNo: itemLine });
      }
      blocks.push({ type: "ol", items, lineNo });
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    // proza cu hard-wrap la ~100 coloane: liniile consecutive sunt un paragraf
    const plines = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      plines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "para", text: plines.join(" "), lineNo });
  }
  return blocks;
}

// ====== FABRICI DE RUN-URI SI PARAGRAFE ======

function runsFrom(tokens, base = {}) {
  const size = base.size || TEXT_SIZE;
  return tokens.map(t => {
    if (t.code) {
      return new TextRun({
        text: t.text, font: MONO,
        size: base.codeSize || size - 2,
        color: base.codeColor || COLOR_CODE_TEXT,
        bold: t.bold || base.bold, italics: t.italic || base.italic,
        shading: base.codePlain ? undefined : { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
      });
    }
    return new TextRun({
      text: t.text, font: FONT, size,
      color: base.color, bold: t.bold || base.bold, italics: t.italic || base.italic,
    });
  });
}

function pRich(tokens) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    alignment: AlignmentType.JUSTIFIED,
    children: runsFrom(tokens),
  });
}

function h1(tokens) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 320 },
    children: runsFrom(tokens, { size: HEADING1_SIZE, bold: true, color: COLOR_PRIMARY, codeSize: HEADING1_SIZE, codeColor: COLOR_PRIMARY, codePlain: true }),
  });
}

function h2(tokens) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_SECONDARY, space: 12 },
    },
    children: runsFrom(tokens, { size: HEADING2_SIZE, bold: true, color: COLOR_PRIMARY, codeSize: HEADING2_SIZE, codeColor: COLOR_PRIMARY, codePlain: true }),
  });
}

function h3(tokens) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 260, after: 120 },
    children: runsFrom(tokens, { size: HEADING3_SIZE, bold: true, italic: true, color: COLOR_TERTIARY, codeSize: HEADING3_SIZE, codeColor: COLOR_TERTIARY, codePlain: true }),
  });
}

function h4(tokens) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 220, after: 100 },
    children: runsFrom(tokens, { size: HEADING4_SIZE, bold: true, color: COLOR_TERTIARY, codeSize: HEADING4_SIZE, codeColor: COLOR_TERTIARY, codePlain: true }),
  });
}

function h5(tokens) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_5,
    spacing: { before: 200, after: 100 },
    children: runsFrom(tokens, { size: HEADING5_SIZE, bold: true, italic: true, color: COLOR_QUOTE, codeSize: HEADING5_SIZE, codeColor: COLOR_QUOTE, codePlain: true }),
  });
}

function bulletRich(tokens) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 280 },
    children: runsFrom(tokens),
  });
}

function orderedRich(tokens, reference) {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: 80, line: 280 },
    children: runsFrom(tokens),
  });
}

function code(text) {
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

function caption(text) {
  return new Paragraph({
    spacing: { before: 120, after: 0 },
    children: [new TextRun({ text, italics: true, size: TEXT_SIZE - 4, font: FONT, color: COLOR_MUTED })],
  });
}

function bq(visualLines, lineNo) {
  const children = [];
  visualLines.forEach((ln, idx) => {
    if (idx > 0) children.push(new TextRun({ break: 1 }));
    children.push(...runsFrom(tokenize(ln, lineNo), { italic: true, color: COLOR_QUOTE }));
  });
  return new Paragraph({
    spacing: { before: 200, after: 200, line: 320 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: COLOR_SECONDARY, space: 16 },
    },
    indent: { left: 200 },
    children,
  });
}

function buildTable(block) {
  const headerTokens = block.header.map(c => tokenize(c, block.lineNo));
  const rowTokens = block.rows.map(r => r.cells.map(c => tokenize(c, r.lineNo)));
  const nCols = block.header.length;

  // latimi proportionale cu cel mai lung continut per coloana, total A4 util
  const TOTAL = 9026;
  const MIN = 700;
  const lens = headerTokens.map(t => Math.max(1, plainLength(t)));
  for (const row of rowTokens) {
    row.forEach((t, ci) => { lens[ci] = Math.max(lens[ci], plainLength(t)); });
  }
  const lenSum = lens.reduce((a, b) => a + b, 0);
  let colWidths = lens.map(l => Math.max(MIN, Math.round((l / lenSum) * TOTAL)));
  const wSum = colWidths.reduce((a, b) => a + b, 0);
  colWidths[nCols - 1] += TOTAL - wSum;

  const border = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerTokens.map((tokens, ci) => new TableCell({
      borders,
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        spacing: { after: 0, line: 260 },
        alignment: block.aligns[ci],
        children: runsFrom(tokens, { size: TEXT_SIZE - 2, bold: true, color: "FFFFFF", codeSize: TEXT_SIZE - 4, codeColor: "FFFFFF", codePlain: true }),
      })],
    })),
  });

  const dataRows = rowTokens.map((row, idx) => new TableRow({
    children: row.map((tokens, ci) => new TableCell({
      borders,
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: idx % 2 === 0 ? undefined : { fill: "F5F5F5", type: ShadingType.CLEAR },
      margins: cellMargins,
      children: [new Paragraph({
        spacing: { after: 0, line: 260 },
        alignment: block.aligns[ci],
        children: runsFrom(tokens, { size: TEXT_SIZE - 2, codeSize: TEXT_SIZE - 4 }),
      })],
    })),
  }));

  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

// ====== CONTINUT DOCUMENT ======

const children = [];

// ====== COPERTA ======
children.push(
  new Paragraph({
    spacing: { before: 0, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 48, color: COLOR_PRIMARY, space: 0 } },
    children: [new TextRun({ text: "", size: 2 })],
  }),
  new Paragraph({ spacing: { before: 2400 }, children: [new TextRun("")] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "DevLife", bold: true, size: 120, font: FONT, color: COLOR_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_MUTED, space: 4 } },
    indent: { left: 3000, right: 3000 },
    children: [new TextRun({ text: "", size: 2 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: "AI Companion biometric pentru dezvoltatori", italics: true, size: 36, font: FONT, color: COLOR_SECONDARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "DOCUMENTAȚIA PROIECTULUI", bold: true, size: 28, font: FONT, color: COLOR_MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1400 },
    children: [new TextRun({ text: "Documentație tehnică", size: 26, font: FONT, color: COLOR_PRIMARY })],
  }),
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
children.push(
  h1(tokenize("Cuprins", 0)),
  new TableOfContents("Cuprins automat", { hyperlink: true, headingStyleRange: "1-3" }),
);

// ====== EMITERE DIN MARKDOWN ======

const blocks = parseBlocks(srcLines);
const olNumberingConfigs = [];
const stats = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, para: 0, table: 0, code: 0, ul: 0, ol: 0, quote: 0, hr: 0 };
let titleSkipped = false;

for (const block of blocks) {
  switch (block.type) {
    case "heading": {
      // titlul documentului e deja pe coperta
      if (block.level === 1 && !titleSkipped) {
        titleSkipped = true;
        if (/^DevLife/.test(block.text)) break;
      }
      const tokens = tokenize(block.text, block.lineNo);
      if (block.level === 1) { stats.h1++; children.push(h1(tokens)); }
      else if (block.level === 2) { stats.h2++; children.push(h2(tokens)); }
      else if (block.level === 3) { stats.h3++; children.push(h3(tokens)); }
      else if (block.level === 4) { stats.h4++; children.push(h4(tokens)); }
      else { stats.h5++; children.push(h5(tokens)); }
      break;
    }
    case "para":
      stats.para++;
      children.push(pRich(tokenize(block.text, block.lineNo)));
      break;
    case "ul":
      stats.ul += block.items.length;
      for (const item of block.items) children.push(bulletRich(tokenize(item.text, item.lineNo)));
      break;
    case "ol": {
      stats.ol += block.items.length;
      // referinta proprie per lista, ca numerotarea sa reporneasca de la 1
      const ref = `ol-${olNumberingConfigs.length + 1}`;
      olNumberingConfigs.push({
        reference: ref,
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      });
      for (const item of block.items) children.push(orderedRich(tokenize(item.text, item.lineNo), ref));
      break;
    }
    case "table":
      stats.table++;
      children.push(buildTable(block));
      break;
    case "code":
      stats.code++;
      if (block.lang === "mermaid") children.push(caption("Diagrama (sursa mermaid):"));
      children.push(code(block.content.join("\n")));
      break;
    case "quote":
      stats.quote++;
      children.push(bq(block.lines, block.lineNo));
      break;
    case "hr":
      stats.hr++;
      break;
    default:
      console.warn(`AVERTISMENT linia ${block.lineNo}: bloc de tip necunoscut "${block.type}"`);
  }
}

// ====== BUILD DOCUMENT ======

const doc = new Document({
  creator: "David Amariei & Matei Vultur",
  title: "DevLife — Documentație tehnică",
  description: "Documentația tehnică a proiectului DevLife",
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
      {
        id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: HEADING4_SIZE, bold: true, font: FONT, color: COLOR_TERTIARY },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 3 },
      },
      {
        id: "Heading5", name: "Heading 5", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: HEADING5_SIZE, bold: true, italics: true, font: FONT, color: COLOR_QUOTE },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 4 },
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
      ...olNumberingConfigs,
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
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
  console.log(`  Blocuri: h1=${stats.h1} h2=${stats.h2} h3=${stats.h3} h4=${stats.h4} h5=${stats.h5} paragrafe=${stats.para} tabele=${stats.table} cod=${stats.code} ul=${stats.ul} ol=${stats.ol} citate=${stats.quote} hr=${stats.hr}`);
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
