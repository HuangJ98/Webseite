/* =========================================================
   FRAGEBOGEN ④ WEBSEITE
   ---------------------------------------------------------
   Steuert die Seite /fragebogen/:
   - beim Start Inhalt (Markdown), Logo und Schrift laden
   - bei jeder Eingabe den Platzhalter (NAME) ersetzen, PDF neu bauen
   - Vorschau (eine Seite, blätterbar) mit pdf.js
   - Download des fertigen PDFs

   Ablauf:  markdown.js -> umbruch.js -> pdf.js -> hier anzeigen
   Einstellungen kommen aus data-Attributen in fragebogen.html.

   Braucht: pdfjsLib, pdfMake, Hypher (als <script> geladen)
   ========================================================= */

import { markdownLesen } from "./markdown.js";
import { schriftLaden } from "./umbruch.js";
import { stilLaden, pdfErzeugen } from "./pdf.js";


const root = document.getElementById("fragebogen-tool");

const vorschau   = document.getElementById("fragebogen-vorschau");
const blaettern  = document.getElementById("fragebogen-blaettern");
const zurueck    = document.getElementById("fragebogen-zurueck");
const weiter     = document.getElementById("fragebogen-weiter");
const seitenzahl = document.getElementById("fragebogen-seitenzahl");
const input      = document.getElementById("fragebogen-name");
const button     = document.getElementById("fragebogen-download");
const status     = document.getElementById("fragebogen-status");

let quelltext = "";         // Inhalt der Markdown-Datei
let logoSvg = null;         // Inhalt der Logo-Datei
let geladen = false;        // erst true, wenn Markdown, Logo und Schrift da sind
let vorschauDoc = null;     // aktuell angezeigtes PDF (pdf.js)
let aktuelleSeite = 1;      // bleibt beim Tippen auf derselben Seite
let timer = null;           // Pause nach dem Tippen
let groessenTimer = null;   // Pause nach dem Ändern der Fenstergröße
let breiteAlt = 0;

// Zähler gegen veraltete Ergebnisse: Beim schnellen Tippen können mehrere PDFs
// gleichzeitig entstehen. Angezeigt wird nur das der letzten Eingabe.
let auftrag = 0;            // zählt PDF-Erzeugungen
let zeichnung = 0;          // zählt Seiten-Zeichnungen (Tippen, Blättern, Größe ändern)

// Signal für fragebogen.html: das Skript ist gestartet (sonst erscheint dort eine Fehlermeldung)
window.fragebogenGestartet = true;

if (root) starten();


function starten() {
    // Fehlen die PDF-Bibliotheken (z. B. nicht hochgeladen), Hinweis statt Endlos-Laden
    if (typeof pdfjsLib === "undefined" || typeof pdfMake === "undefined" || typeof Hypher === "undefined") {
        vorschau.textContent = "Die Vorschau ist gerade nicht verfügbar (PDF-Bibliothek nicht gefunden).";
        console.error("pdf.js, pdfmake oder Hypher nicht geladen: assets/js/vendor/ prüfen");
        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = root.dataset.worker;

    // Bis alles geladen ist, kann man noch nichts eingeben (sonst entsteht ein leeres PDF)
    input.disabled = true;
    button.disabled = true;

    // Aussehen aus _data/fragebogen_stil.yml (von Jekyll als JSON in die Seite gesetzt)
    const stil = document.getElementById("fragebogen-stil");
    if (stil) stilLaden(stil.textContent);

    ereignisseVerbinden();

    Promise.all([
        fetch(root.dataset.inhalt).then((r) => {
            if (!r.ok) throw new Error("Inhalt nicht gefunden: " + root.dataset.inhalt);
            return r.text();
        }),
        fetch(root.dataset.logo).then((r) => (r.ok ? r.text() : null)).catch(() => null),
        schriftLaden().catch((e) => console.warn("Schrift zum Messen nicht geladen, ohne Silbentrennung:", e))
    ])
        .then(([md, svg]) => {
            quelltext = md;
            logoSvg = svg;
            geladen = true;
            input.disabled = false;
            breiteAlt = vorschau.clientWidth;
            return aktualisieren();
        })
        .catch((e) => {
            console.error(e);
            vorschau.replaceChildren();
            meldung("Der Inhalt des Fragebogens konnte nicht geladen werden.", true);
        });
}


/* ---------- PDF für den eingegebenen Namen ---------- */

function pdfFuer(name) {
    const platzhalter = root.dataset.platzhalter || "NAME";
    // Nur als eigenes Wort ersetzen: "NAME" ja, "VORNAME" oder "NAMEN" nicht.
    // Funktion statt Text als Ersatz, damit Zeichen wie "$" im Namen nichts auslösen.
    const muster = new RegExp("(^|[^\\p{L}\\p{N}])" + platzhalter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "gu");
    const ersetzt = quelltext.replace(muster, (treffer, davor) => davor + (name || platzhalter));
    return pdfErzeugen(markdownLesen(ersetzt), {
        name: name,
        logoSvg: logoSvg,
        kopfzeile: root.dataset.kopfzeile
    });
}


/* ---------- Vorschau (eine Seite, blätterbar) ---------- */

// Neues PDF übernehmen. "nr" = Nummer der Eingabe; ist inzwischen eine neuere
// unterwegs, wird dieses Ergebnis verworfen.
async function vorschauZeichnen(bytes, nr) {
    const neu = await pdfjsLib.getDocument({ data: bytes }).promise;
    if (nr !== auftrag) {               // veraltet: gleich wieder freigeben
        neu.destroy();
        return;
    }

    const alt = vorschauDoc;
    vorschauDoc = neu;
    aktuelleSeite = Math.min(aktuelleSeite, neu.numPages);
    await seiteZeigen(aktuelleSeite);
    if (alt) alt.destroy();             // Speicher des vorherigen PDFs freigeben
}

async function seiteZeigen(nummer) {
    if (!vorschauDoc) return;
    aktuelleSeite = nummer;
    const nr  = ++zeichnung;
    const doc = vorschauDoc;

    try {
        await seiteRendern(doc, nummer, nr);
    } catch (e) {
        if (nr !== zeichnung) return;   // veraltete Zeichnung abgebrochen: kein Fehler
        throw e;
    }
}

async function seiteRendern(doc, nummer, nr) {
    const seite    = await doc.getPage(nummer);
    const basis    = seite.getViewport({ scale: 1 });
    const dpr      = window.devicePixelRatio || 1;
    const breite   = Math.min(vorschau.clientWidth, 720);
    const viewport = seite.getViewport({ scale: (breite / basis.width) * dpr });

    const canvas = document.createElement("canvas");
    canvas.className = "fragebogen-seite";
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Vorschau Seite " + nummer + " von " + doc.numPages);

    await seite.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    if (nr !== zeichnung) return;       // inzwischen wurde etwas Neueres gezeichnet
    vorschau.replaceChildren(canvas);

    // Blättern nur zeigen, wenn es mehr als eine Seite gibt
    const anzahl = doc.numPages;
    blaettern.hidden = anzahl < 2;
    seitenzahl.textContent = "Seite " + nummer + " von " + anzahl;
    zurueck.disabled = nummer <= 1;
    weiter.disabled  = nummer >= anzahl;
}


/* ---------- Eingabe und Download ---------- */

const MAX_LAENGE = 60;      // wie maxlength im Eingabefeld (das man im Browser umgehen könnte)

// Eingabe bereinigen, bevor sie in den Fragebogen eingesetzt wird.
// Erlaubt: Buchstaben (lateinisch, griechisch, kyrillisch – mehr kann die PDF-Schrift nicht),
//          Ziffern, Leerzeichen und übliche Satzzeichen.
// Entfernt wird alles andere, vor allem Zeichen mit Bedeutung im Fragebogen-Markdown
// ("|" Antworten/Spalten, "*" fett, "_" Schreiblinie, "<" Kommentar, "#", …),
// Emojis sowie unsichtbare Steuer- und Richtungszeichen.
const ERLAUBT = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{M}\p{N} .,:;!?'’()\/&+%@–-]/u;

function bereinigen(roh) {
    const entfernt = new Set();
    let name = "";
    for (const zeichen of roh) {
        if (ERLAUBT.test(zeichen)) name += zeichen;
        else if (!/\s/.test(zeichen)) entfernt.add(zeichen);
        else name += " ";
    }
    name = name.replace(/\s+/g, " ").trim();
    if (name.length > MAX_LAENGE) name = name.slice(0, MAX_LAENGE).trim();
    // Unsichtbare Zeichen nicht in der Meldung anzeigen (man könnte sie ohnehin nicht sehen)
    const sichtbar = Array.from(entfernt).filter((z) => !/\p{C}/u.test(z));
    return { name: name, entfernt: sichtbar };
}

function eingabe() {
    const ergebnis = bereinigen(input.value);
    if (ergebnis.entfernt.length) {
        meldung("Diese Zeichen sind nicht erlaubt und werden weggelassen: " + ergebnis.entfernt.join(" "), true);
    }
    return ergebnis.name;
}

async function aktualisieren() {
    if (!geladen) return;
    meldung("");
    const name = eingabe();
    const hinweis = status.textContent;     // ggf. Hinweis auf entfernte Zeichen behalten
    const nr = ++auftrag;
    button.disabled = name === "";
    try {
        const bytes = await pdfFuer(name);
        if (nr !== auftrag) return;     // inzwischen wurde weitergetippt
        await vorschauZeichnen(bytes, nr);
        if (nr === auftrag && !hinweis) meldung("");
    } catch (e) {
        if (nr !== auftrag) return;
        console.error(e);
        meldung("Der Fragebogen konnte nicht erstellt werden. Bitte laden Sie die Seite neu.", true);
    }
}

async function herunterladen() {
    const name = eingabe();
    if (!name || !geladen) return;
    try {
        const bytes = await pdfFuer(name);
        const url   = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const link  = document.createElement("a");
        link.href = url;
        link.download = "Fragebogen-" + dateiname(name) + ".pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        console.error(e);
        meldung("Der Fragebogen konnte nicht erstellt werden. Bitte laden Sie die Seite neu.", true);
    }
}

function dateiname(name) {
    return name
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "individuell";
}

function zeichenFehler(e) {
    console.error(e);
    meldung("Die Vorschau konnte nicht angezeigt werden. Bitte laden Sie die Seite neu.", true);
}

function meldung(text, fehler) {
    status.textContent = text;
    status.classList.toggle("is-error", !!fehler);
}


function ereignisseVerbinden() {
    // Vorschau erst kurz nach dem Tippen neu bauen
    input.addEventListener("input", () => {
        button.disabled = !geladen || bereinigen(input.value).name === "";
        clearTimeout(timer);
        timer = setTimeout(aktualisieren, 400);
    });

    root.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        herunterladen();
    });

    zurueck.addEventListener("click", () => {
        if (aktuelleSeite > 1) seiteZeigen(aktuelleSeite - 1).catch(zeichenFehler);
    });

    weiter.addEventListener("click", () => {
        if (vorschauDoc && aktuelleSeite < vorschauDoc.numPages) seiteZeigen(aktuelleSeite + 1).catch(zeichenFehler);
    });

    // Vorschau an neue Breite anpassen (z. B. Handy drehen)
    window.addEventListener("resize", () => {
        if (Math.abs(vorschau.clientWidth - breiteAlt) < 40) return;
        breiteAlt = vorschau.clientWidth;
        clearTimeout(groessenTimer);
        groessenTimer = setTimeout(() => seiteZeigen(aktuelleSeite).catch(zeichenFehler), 300);
    });
}
