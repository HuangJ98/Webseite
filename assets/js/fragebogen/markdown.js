/* =========================================================
   FRAGEBOGEN ① MARKDOWN LESEN
   ---------------------------------------------------------
   Zerlegt assets/fragebogen/fragebogen.md in Bausteine:

     # Titel                 -> { typ: "titel" }
     Normaler Text           -> { typ: "absatz" }
     ## Überschrift          -> { typ: "ueberschrift" }
     - Ja/Nein: Frage        -> { typ: "janein" }
     - Code: Frage           -> { typ: "code" }      Schreiblinie, z. B. persönlicher Code
     - Code: Frage | 2       -> { typ: "code", gruppen: [2] }  2 kurze Striche für je ein Zeichen
     - Code: Frage | 1 2 1   -> { typ: "code", gruppen: [1,2,1] }  Striche in Gruppen: _   _ _   _
     - Text                  -> { typ: "liste" }  Aufzählungspunkt (direkt hintereinander = eine Liste)
     - Zahl: Frage           -> { typ: "zahl" }      kurze Schreiblinie für eine Zahl
     - Auswahl: Frage | A | B | C
                             -> { typ: "auswahl", optionen: [...] }
                                (Option mit "___" am Ende bekommt eine Schreiblinie,
                                 z. B. "andere: ___")
     - Einschätzung: Frage | links | rechts | 5
                             -> { typ: "einschaetzung" }  Kästchen 1…5, nur die Enden beschriftet
                                (Anzahl der Stufen am Ende optional, Standard 5)
     - Einschätzung: Frage | A | B | C | D | E | keine Angabe
                                mehr als zwei Beschriftungen: jedes Kästchen beschriftet;
                                "keine Angabe" am Ende: eigenes Kästchen, rechts abgesetzt
     Skala: A | B | C        -> Beschriftung für die folgenden Aussagen
     Skala: A | B || X | Y   -> "||" = hellgrauer senkrechter Strich an dieser Stelle der Tabelle
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
    let trennerNach = 0;      // Strich nach dieser Skalen-Spalte (0 = kein Strich)
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
            // "||" markiert, wo ein senkrechter Trennstrich hin soll
            const gruppen = m[1].split("||");
            const teilen = (x) => x.split("|").map((s) => s.trim()).filter(Boolean);
            skala = teilen(m[1].replace(/\|\|/g, "|"));
            trennerNach = gruppen.length > 1 ? teilen(gruppen[0]).length : 0;
        } else if ((m = zeile.match(/^[-*]\s+Ja\s*\/\s*Nein:\s*(.*)$/i))) {
            absatzAbschliessen();
            teile.push({ typ: "janein", text: m[1] });
        } else if ((m = zeile.match(/^[-*]\s+Code:\s*(.*)$/i))) {
            absatzAbschliessen();
            // "Frage | Anzahl Zeichen" (optional) -> kurze Striche statt Linie
            // "Frage | 1 2 1" -> Striche in Gruppen, mit größerem Abstand zwischen den Gruppen
            const stuecke = m[1].split("|").map((x) => x.trim());
            const gruppen = (stuecke[1] || "").split(/\s+/).map((x) => parseInt(x, 10))
                .filter((n) => n >= 1 && n <= 20);
            teile.push({ typ: "code", text: stuecke[0], gruppen: gruppen });
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
            // "Frage | links | rechts | Anzahl Stufen (optional) | keine Angabe (optional)"
            // oder "Frage | Stufe 1 | Stufe 2 | … | keine Angabe (optional)"
            const stuecke = m[1].split("|").map((x) => x.trim()).filter(Boolean);
            const frage = stuecke.shift() || "";

            let keineAngabe = false;
            if (stuecke.length && /^keine angabe$/i.test(stuecke[stuecke.length - 1])) {
                stuecke.pop();
                keineAngabe = true;
            }
            let stufen = 5;
            if (stuecke.length && /^\d+$/.test(stuecke[stuecke.length - 1])) {
                const n = parseInt(stuecke.pop(), 10);
                if (n >= 2 && n <= 11) stufen = n;
            }
            // Mehr als zwei Beschriftungen: jede Stufe ist beschriftet
            if (stuecke.length > 2) stufen = stuecke.length;

            teile.push({ typ: "einschaetzung", text: frage, beschriftungen: stuecke, stufen: stufen, keineAngabe: keineAngabe });
        } else if ((m = zeile.match(/^\d+[.)]\s+(.*)$/))) {
            absatzAbschliessen();
            // Aufeinanderfolgende Aussagen bilden eine Tabelle
            const letztes = teile[teile.length - 1];
            if (letztes && letztes.typ === "likert") {
                letztes.aussagen.push(m[1]);
            } else {
                teile.push({ typ: "likert", skala: skala, trennerNach: trennerNach, aussagen: [m[1]] });
            }
        } else if ((m = zeile.match(/^[-*•]\s+(.*)$/))) {
            absatzAbschliessen();
            // einfacher Aufzählungspunkt; direkt aufeinanderfolgende Punkte bilden eine Liste
            const letztes = teile[teile.length - 1];
            if (letztes && letztes.typ === "liste") letztes.punkte.push(m[1]);
            else teile.push({ typ: "liste", punkte: [m[1]] });
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
