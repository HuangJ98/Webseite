/* =========================================================
   FRAGEBOGEN ① MARKDOWN LESEN
   ---------------------------------------------------------
   Zerlegt assets/fragebogen/fragebogen.md in Bausteine:

     # Titel                 -> { typ: "titel" }
     Normaler Text           -> { typ: "absatz" }
     ## Überschrift          -> { typ: "ueberschrift" }
     - Ja/Nein: Frage        -> { typ: "janein" }
     - Code: Frage           -> { typ: "code" }      Schreiblinie, z. B. persönlicher Code
     - Zahl: Frage           -> { typ: "zahl" }      kurze Schreiblinie für eine Zahl
     - Auswahl: Frage | A | B | C
                             -> { typ: "auswahl", optionen: [...] }
                                (Option mit "___" am Ende bekommt eine Schreiblinie,
                                 z. B. "andere: ___")
     - Einschätzung: Frage | links | rechts | 5
                             -> { typ: "einschaetzung" }  Kästchen 1…5, nur die Enden beschriftet
                                (Anzahl der Stufen am Ende optional, Standard 5)
     Skala: A | B | C        -> Beschriftung für die folgenden Aussagen
     1. Aussage              -> { typ: "likert", skala, aussagen: [...] }
                                (Aussagen direkt hintereinander = eine Tabelle)
     ---                     -> { typ: "seitenumbruch" }  Rest beginnt auf neuer Seite
     ### Offene Frage        -> { typ: "freitext", beschreibung }
     Text direkt darunter    -> Beschreibung der offenen Frage

   Neuer Fragetyp: hier die Schreibweise erkennen,
   dann in pdf.js festlegen, wie er aussieht.
   ========================================================= */


// Ergebnis: Liste von { typ, text, ... } in der Reihenfolge der Datei
export function markdownLesen(md) {
    md = md.replace(/<!--[\s\S]*?-->/g, "");            // Kommentare entfernen
    const zeilen = md.split(/\r?\n/);
    const teile = [];
    let skala = ["1", "2", "3", "4", "5"];
    let absatz = [];

    function absatzAbschliessen() {
        if (!absatz.length) return;
        const text = absatz.join(" ").trim();
        const letztes = teile[teile.length - 1];
        // Text direkt nach "### Frage" ist die Beschreibung der offenen Frage
        if (letztes && letztes.typ === "freitext" && !letztes.beschreibung) {
            letztes.beschreibung = text;
        } else {
            teile.push({ typ: "absatz", text: text });
        }
        absatz = [];
    }

    zeilen.forEach((roh) => {
        const zeile = roh.trim();
        let m;

        if (zeile === "") { absatzAbschliessen(); return; }

        if (/^-{3,}$/.test(zeile)) {
            absatzAbschliessen();
            teile.push({ typ: "seitenumbruch" });
            return;
        }

        if ((m = zeile.match(/^###\s+(.*)$/))) {
            absatzAbschliessen();
            teile.push({ typ: "freitext", text: m[1] });
        } else if ((m = zeile.match(/^##\s+(.*)$/))) {
            absatzAbschliessen();
            teile.push({ typ: "ueberschrift", text: m[1] });
        } else if ((m = zeile.match(/^#\s+(.*)$/))) {
            absatzAbschliessen();
            teile.push({ typ: "titel", text: m[1] });
        } else if ((m = zeile.match(/^Skala:\s*(.*)$/i))) {
            absatzAbschliessen();
            skala = m[1].split("|").map((s) => s.trim()).filter(Boolean);
        } else if ((m = zeile.match(/^[-*]\s+Ja\s*\/\s*Nein:\s*(.*)$/i))) {
            absatzAbschliessen();
            teile.push({ typ: "janein", text: m[1] });
        } else if ((m = zeile.match(/^[-*]\s+Code:\s*(.*)$/i))) {
            absatzAbschliessen();
            teile.push({ typ: "code", text: m[1] });
        } else if ((m = zeile.match(/^[-*]\s+Zahl:\s*(.*)$/i))) {
            absatzAbschliessen();
            teile.push({ typ: "zahl", text: m[1] });
        } else if ((m = zeile.match(/^[-*]\s+Auswahl:\s*(.*)$/i))) {
            absatzAbschliessen();
            // "Frage | Option A | Option B | …"
            const stuecke = m[1].split("|").map((x) => x.trim()).filter(Boolean);
            teile.push({ typ: "auswahl", text: stuecke[0] || "", optionen: stuecke.slice(1) });
        } else if ((m = zeile.match(/^[-*]\s+Einsch(?:ä|ae)tzung:\s*(.*)$/i))) {
            absatzAbschliessen();
            // "Frage | Beschriftung links | Beschriftung rechts | Anzahl Stufen (optional)"
            const stuecke = m[1].split("|").map((x) => x.trim());
            const stufen = parseInt(stuecke[3], 10);
            teile.push({
                typ: "einschaetzung",
                text: stuecke[0] || "",
                links: stuecke[1] || "",
                rechts: stuecke[2] || "",
                stufen: stufen >= 2 && stufen <= 11 ? stufen : 5
            });
        } else if ((m = zeile.match(/^\d+[.)]\s+(.*)$/))) {
            absatzAbschliessen();
            // Aufeinanderfolgende Aussagen bilden eine Tabelle
            const letztes = teile[teile.length - 1];
            if (letztes && letztes.typ === "likert") {
                letztes.aussagen.push(m[1]);
            } else {
                teile.push({ typ: "likert", skala: skala, aussagen: [m[1]] });
            }
        } else {
            absatz.push(zeile);
        }
    });
    absatzAbschliessen();
    return teile;
}


// **fett** in Textstücke umwandeln: ["normal ", { text: "fett", bold: true }]
export function inline(text) {
    return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((stueck) =>
        stueck.startsWith("**") ? { text: stueck.slice(2, -2), bold: true } : stueck
    );
}
