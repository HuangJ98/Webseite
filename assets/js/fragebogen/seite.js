/* =========================================================
   FRAGEBOGEN ④ WEBSEITE
   ---------------------------------------------------------
   Steuert die Seite /fragebogen/:
   - beim Start Inhalt (Markdown), Logo und Schrift laden
   - bei jeder Eingabe [Name] ersetzen, PDF neu bauen
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
let vorschauDoc = null;     // aktuell angezeigtes PDF (pdf.js)
let aktuelleSeite = 1;      // bleibt beim Tippen auf derselben Seite
let timer = null;
let breiteAlt = 0;

if (root) starten();


function starten() {
    // Fehlen die PDF-Bibliotheken (z. B. nicht hochgeladen), Hinweis statt Endlos-Laden
    if (typeof pdfjsLib === "undefined" || typeof pdfMake === "undefined" || typeof Hypher === "undefined") {
        vorschau.textContent = "Die Vorschau ist gerade nicht verfügbar (PDF-Bibliothek nicht gefunden).";
        console.error("pdf.js, pdfmake oder Hypher nicht geladen: assets/js/vendor/ prüfen");
        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = root.dataset.worker;

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
    const platzhalter = root.dataset.platzhalter || "[Name]";
    const ersetzt = quelltext.split(platzhalter).join(name || platzhalter);
    return pdfErzeugen(markdownLesen(ersetzt), {
        logoSvg: logoSvg,
        kopfzeile: root.dataset.kopfzeile
    });
}


/* ---------- Vorschau (eine Seite, blätterbar) ---------- */

async function vorschauZeichnen(bytes) {
    vorschauDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    aktuelleSeite = Math.min(aktuelleSeite, vorschauDoc.numPages);
    await seiteZeigen(aktuelleSeite);
}

async function seiteZeigen(nummer) {
    if (!vorschauDoc) return;
    aktuelleSeite = nummer;

    const seite    = await vorschauDoc.getPage(nummer);
    const basis    = seite.getViewport({ scale: 1 });
    const dpr      = window.devicePixelRatio || 1;
    const breite   = Math.min(vorschau.clientWidth, 720);
    const viewport = seite.getViewport({ scale: (breite / basis.width) * dpr });

    const canvas = document.createElement("canvas");
    canvas.className = "fragebogen-seite";
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Vorschau Seite " + nummer + " von " + vorschauDoc.numPages);

    await seite.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    vorschau.replaceChildren(canvas);

    // Blättern nur zeigen, wenn es mehr als eine Seite gibt
    const anzahl = vorschauDoc.numPages;
    blaettern.hidden = anzahl < 2;
    seitenzahl.textContent = "Seite " + nummer + " von " + anzahl;
    zurueck.disabled = nummer <= 1;
    weiter.disabled  = nummer >= anzahl;
}


/* ---------- Eingabe und Download ---------- */

async function aktualisieren() {
    const name = input.value.trim();
    button.disabled = name === "";
    try {
        await vorschauZeichnen(await pdfFuer(name));
        meldung("");
    } catch (e) {
        console.error(e);
        meldung("Der Fragebogen konnte nicht erstellt werden. Bitte laden Sie die Seite neu.", true);
    }
}

async function herunterladen() {
    const name = input.value.trim();
    if (!name) return;
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

function meldung(text, fehler) {
    status.textContent = text;
    status.classList.toggle("is-error", !!fehler);
}


function ereignisseVerbinden() {
    // Vorschau erst kurz nach dem Tippen neu bauen
    input.addEventListener("input", () => {
        button.disabled = input.value.trim() === "";
        clearTimeout(timer);
        timer = setTimeout(aktualisieren, 400);
    });

    root.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        herunterladen();
    });

    zurueck.addEventListener("click", () => {
        if (aktuelleSeite > 1) seiteZeigen(aktuelleSeite - 1);
    });

    weiter.addEventListener("click", () => {
        if (vorschauDoc && aktuelleSeite < vorschauDoc.numPages) seiteZeigen(aktuelleSeite + 1);
    });

    // Vorschau an neue Breite anpassen (z. B. Handy drehen)
    window.addEventListener("resize", () => {
        if (Math.abs(vorschau.clientWidth - breiteAlt) < 40) return;
        breiteAlt = vorschau.clientWidth;
        clearTimeout(timer);
        timer = setTimeout(() => seiteZeigen(aktuelleSeite), 300);
    });
}
