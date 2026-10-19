/* =========================================================
   FRAGEBOGEN: [Name] in der PDF-Vorlage ersetzen
   ---------------------------------------------------------
   1. Vorlage einmal laden und alle Stellen mit dem Platzhalter
      finden (pdf.js liefert Text + Position).
   2. Bei jeder Eingabe ein neues PDF bauen (pdf-lib):
      Platzhalter weiß überdecken, Name an dieselbe Stelle schreiben.
   3. Das neue PDF als Vorschau zeigen bzw. herunterladen.

   Einstellungen kommen aus data-Attributen in fragebogen.html
   (Pfad der Vorlage, Platzhalter-Wort).
   ========================================================= */

(function () {
    "use strict";

    const root = document.getElementById("fragebogen-tool");
    if (!root) return;

    // Fehlen die PDF-Bibliotheken (z. B. nicht hochgeladen), Hinweis statt Endlos-Laden
    if (typeof pdfjsLib === "undefined" || typeof PDFLib === "undefined") {
        document.getElementById("fragebogen-vorschau").textContent =
            "Die Vorschau ist gerade nicht verfügbar (PDF-Bibliothek nicht gefunden).";
        console.error("pdf.js oder pdf-lib nicht geladen: assets/js/vendor/ prüfen");
        return;
    }

    const VORLAGE    = root.dataset.vorlage;
    const PLATZHALTER = root.dataset.platzhalter || "[Name]";
    const MIN_SCHRIFT = 0.6;   // Schrift höchstens auf 60 % verkleinern

    const input    = document.getElementById("fragebogen-name");
    const button   = document.getElementById("fragebogen-download");
    const status   = document.getElementById("fragebogen-status");
    const vorschau = document.getElementById("fragebogen-vorschau");

    pdfjsLib.GlobalWorkerOptions.workerSrc = root.dataset.worker;

    let vorlageBytes = null;   // Original-PDF
    let fundstellen  = [];     // alle Zeilenstücke mit Platzhalter
    let helvetica    = null;   // nur für Breitenberechnung


    /* ---------- 1. Vorlage laden und Platzhalter finden ---------- */

    async function vorlageVorbereiten() {
        const antwort = await fetch(VORLAGE);
        if (!antwort.ok) throw new Error("Vorlage nicht gefunden: " + VORLAGE);
        vorlageBytes = new Uint8Array(await antwort.arrayBuffer());

        // Schrift-Maße für die Berechnung, wo genau im Text der Platzhalter steht
        const hilfsPdf = await PDFLib.PDFDocument.create();
        helvetica = await hilfsPdf.embedFont(PDFLib.StandardFonts.Helvetica);

        const doc = await pdfjsLib.getDocument({ data: vorlageBytes.slice() }).promise;

        for (let s = 1; s <= doc.numPages; s++) {
            const seite  = await doc.getPage(s);
            const inhalt = await seite.getTextContent();
            const breite = seite.view[2];
            const bild   = await seiteAlsBild(seite);   // für die Schriftfarbe

            await seite.getOperatorList();               // lädt Schriftnamen (fett?)
            const items = inhalt.items.filter((i) => i.str);

            items.forEach((item) => {
                const pos = item.str.indexOf(PLATZHALTER);
                if (pos === -1) return;

                const t      = item.transform;
                const groesse = Math.hypot(t[2], t[3]);
                const x0     = t[4];
                const y      = t[5];

                // Wo beginnt der Platzhalter innerhalb des Textstücks?
                const anteil = breiteVon(item.str.slice(0, pos)) / breiteVon(item.str);
                const xStart = x0 + item.width * anteil;
                const xEnde  = x0 + item.width;

                // Wie viel Platz ist bis zum nächsten Text in derselben Zeile?
                const naechstes = items
                    .filter((o) => o !== item && Math.abs(o.transform[5] - y) < 1 && o.transform[4] > xEnde - 0.5)
                    .map((o) => o.transform[4]);
                const grenze = naechstes.length ? Math.min(...naechstes) - 4 : breite - 40;

                fundstellen.push({
                    seite: s - 1,
                    rest: item.str.slice(pos),   // ab Platzhalter bis Zeilenstück-Ende
                    x: xStart,
                    y: y,
                    groesse: groesse,
                    breiteAlt: xEnde - xStart,
                    platz: grenze - xStart,
                    fett: istFett(seite, item.fontName),
                    farbe: farbeAn(bild, xStart, y, xEnde - xStart, groesse)
                });
            });
        }
    }

    function breiteVon(text) {
        try {
            return helvetica.widthOfTextAtSize(text, 1) || 1;
        } catch (e) {
            return text.length || 1;   // Zeichen, die Helvetica nicht kennt
        }
    }

    function istFett(seite, fontName) {
        try {
            const font = seite.commonObjs.get(fontName);
            return /bold|black|heavy|semibold/i.test(font && font.name);
        } catch (e) {
            return false;
        }
    }

    // Seite einmal unsichtbar zeichnen, um die Textfarbe ablesen zu können
    async function seiteAlsBild(seite) {
        const skala    = 2;
        const viewport = seite.getViewport({ scale: skala });
        const canvas   = document.createElement("canvas");
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        await seite.render({ canvasContext: ctx, viewport: viewport }).promise;
        return { ctx: ctx, skala: skala, hoehe: viewport.height };
    }

    // Mittlere Farbe der dunklen Pixel im Bereich des Platzhalters
    function farbeAn(bild, x, y, breite, groesse) {
        const k  = bild.skala;
        const px = Math.round(x * k);
        const py = Math.round(bild.hoehe - (y + groesse * 0.8) * k);
        const w  = Math.max(1, Math.round(breite * k));
        const h  = Math.max(1, Math.round(groesse * k));
        const daten = bild.ctx.getImageData(px, py, w, h).data;

        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < daten.length; i += 4) {
            const hell = 0.299 * daten[i] + 0.587 * daten[i + 1] + 0.114 * daten[i + 2];
            if (hell < 150) { r += daten[i]; g += daten[i + 1]; b += daten[i + 2]; n++; }
        }
        if (!n) return PDFLib.rgb(0, 0, 0);
        return PDFLib.rgb(r / n / 255, g / n / 255, b / n / 255);
    }


    /* ---------- 2. Neues PDF mit dem Namen bauen ---------- */

    async function pdfBauen(name) {
        const pdf    = await PDFLib.PDFDocument.load(vorlageBytes);
        const normal = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
        const fett   = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const seiten = pdf.getPages();
        let verkleinert = 0;

        fundstellen.forEach((f) => {
            const font  = f.fett ? fett : normal;
            const text  = f.rest.split(PLATZHALTER).join(name);
            let groesse = f.groesse;

            // Passt der Text nicht in die Zeile? Dann Schrift verkleinern
            const noetig = font.widthOfTextAtSize(text, groesse);
            if (noetig > f.platz) {
                groesse = Math.max(f.groesse * MIN_SCHRIFT, groesse * f.platz / noetig);
                verkleinert++;
            }

            const seite = seiten[f.seite];

            // Platzhalter (und den Rest der Zeile) weiß überdecken
            seite.drawRectangle({
                x: f.x - 0.5,
                y: f.y - f.groesse * 0.3,
                width: f.breiteAlt + 1,
                height: f.groesse * 1.25,
                color: PDFLib.rgb(1, 1, 1)
            });

            seite.drawText(text, { x: f.x, y: f.y, size: groesse, font: font, color: f.farbe });
        });

        return { bytes: await pdf.save(), verkleinert: verkleinert };
    }


    /* ---------- 3. Vorschau und Download ---------- */

    async function vorschauZeichnen(bytes) {
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        const breite = vorschau.clientWidth;
        const fragment = document.createDocumentFragment();

        for (let s = 1; s <= doc.numPages; s++) {
            const seite   = await doc.getPage(s);
            const basis   = seite.getViewport({ scale: 1 });
            const dpr     = window.devicePixelRatio || 1;
            const skala   = (breite / basis.width) * dpr;
            const viewport = seite.getViewport({ scale: skala });

            const canvas = document.createElement("canvas");
            canvas.className = "fragebogen-seite";
            canvas.width  = viewport.width;
            canvas.height = viewport.height;
            canvas.setAttribute("aria-label", "Vorschau Seite " + s);
            canvas.setAttribute("role", "img");

            await seite.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
            fragment.appendChild(canvas);
        }

        vorschau.replaceChildren(fragment);
    }

    async function aktualisieren() {
        const name = input.value.trim();
        button.disabled = name === "";

        try {
            if (name === "") {
                await vorschauZeichnen(vorlageBytes.slice());
                meldung("Geben Sie den Namen der Technologie ein. Die Vorschau zeigt dann den fertigen Fragebogen.");
                return;
            }
            const ergebnis = await pdfBauen(name);
            await vorschauZeichnen(ergebnis.bytes);
            meldung(ergebnis.verkleinert
                ? "Der Name ist lang. An " + ergebnis.verkleinert + " Stelle(n) wurde die Schrift etwas verkleinert, damit er in die Zeile passt."
                : "");
        } catch (e) {
            meldung(fehlertext(e), true);
            button.disabled = true;
        }
    }

    async function herunterladen() {
        const name = input.value.trim();
        if (!name) return;

        try {
            const { bytes } = await pdfBauen(name);
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "Fragebogen-" + dateiname(name) + ".pdf";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            meldung(fehlertext(e), true);
        }
    }

    function dateiname(name) {
        return name
            .replace(/[ä]/g, "ae").replace(/[ö]/g, "oe").replace(/[ü]/g, "ue")
            .replace(/[Ä]/g, "Ae").replace(/[Ö]/g, "Oe").replace(/[Ü]/g, "Ue").replace(/ß/g, "ss")
            .replace(/[^A-Za-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "individuell";
    }

    function fehlertext(e) {
        if (/cannot encode|WinAnsi/i.test(String(e && e.message))) {
            return "Der Name enthält ein Zeichen, das im PDF nicht dargestellt werden kann. Bitte nur Buchstaben, Zahlen und übliche Satzzeichen verwenden.";
        }
        console.error(e);
        return "Der Fragebogen konnte nicht erstellt werden. Bitte laden Sie die Seite neu.";
    }

    function meldung(text, fehler) {
        status.textContent = text;
        status.classList.toggle("is-error", !!fehler);
    }

    // Vorschau erst kurz nach dem Tippen neu zeichnen
    let timer = null;
    input.addEventListener("input", () => {
        button.disabled = input.value.trim() === "";
        clearTimeout(timer);
        timer = setTimeout(aktualisieren, 300);
    });

    root.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        herunterladen();
    });

    // Vorschau an neue Breite anpassen (z. B. Handy drehen)
    let breiteAlt = 0;
    window.addEventListener("resize", () => {
        if (Math.abs(vorschau.clientWidth - breiteAlt) < 40) return;
        breiteAlt = vorschau.clientWidth;
        clearTimeout(timer);
        timer = setTimeout(aktualisieren, 300);
    });

    vorlageVorbereiten()
        .then(() => {
            breiteAlt = vorschau.clientWidth;
            return aktualisieren();
        })
        .catch((e) => {
            console.error(e);
            vorschau.replaceChildren();
            meldung("Die Vorlage konnte nicht geladen werden.", true);
        });
})();
