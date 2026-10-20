/* =========================================================
   FRAGEBOGEN ② ZEILENUMBRUCH MIT SILBENTRENNUNG
   ---------------------------------------------------------
   pdfmake kann keine Silbentrennung. Deshalb brechen wir die
   Zeilen selbst um, bevor pdfmake das PDF setzt:
   - Silben kommen von Hypher mit deutschen Trennregeln
     (assets/js/vendor/hypher-de.js)
   - Wortbreiten messen wir mit derselben Schrift wie im PDF
     (Roboto aus pdfmake), damit die Zeilen genau passen

   Braucht: Hypher, HypherDe, pdfMake (als <script> geladen)
   ========================================================= */

import { inline } from "./markdown.js";

const SICHERHEIT = 0.97;    // etwas Luft, damit pdfmake nie selbst umbrechen muss

let silben = null;          // Hypher mit deutschen Regeln (wird beim Laden erstellt)
let messen = null;          // Canvas zum Ausmessen; null = Schrift nicht geladen


// Die Schrift aus dem PDF (Roboto) auch im Browser laden, damit die
// gemessenen Breiten genau zum PDF passen. Fett = Roboto-Medium (wie pdfmake).
export async function schriftLaden() {
    silben = new Hypher(HypherDe);

    const datei = (name) => Uint8Array.from(atob(pdfMake.vfs[name]), (c) => c.charCodeAt(0)).buffer;
    const schriften = [
        new FontFace("EditaPdf", datei("Roboto-Regular.ttf"), { weight: "400" }),
        new FontFace("EditaPdf", datei("Roboto-Medium.ttf"),  { weight: "700" })
    ];
    await Promise.all(schriften.map((f) => f.load()));
    schriften.forEach((f) => document.fonts.add(f));
    messen = document.createElement("canvas").getContext("2d");
}


function breiteVon(text, groesse, fett) {
    messen.font = (fett ? "700 " : "400 ") + groesse + "px EditaPdf";
    return messen.measureText(text).width;
}

// Mögliche Trennstellen eines Wortes: Silben + nach vorhandenen Bindestrichen
// ("Pflegedoku-App" -> "Pflegedoku-", "App"; ohne Regex-Lookbehind,
//  den ältere Safari-Versionen vor iOS 16.4 nicht kennen)
function silbenVon(wort) {
    const teile = wort.split("-").map((t, i, alle) => (i < alle.length - 1 ? t + "-" : t)).filter(Boolean);
    return teile.flatMap((teil) => silben.hyphenate(teil));
}


// Text in Zeilen der Breite "max" (pt) aufteilen. Passt ein Wort nicht mehr,
// wird es an der letzten passenden Silbe mit "-" getrennt.
// Ergebnis: pdfmake-Textstücke mit "\n" am Zeilenende.
export function umbrechen(text, max, groesse, grundFett) {
    if (!messen) return inline(text);       // Schrift fehlt: pdfmake bricht selbst um
    max = Math.max(max * SICHERHEIT, 1);    // nie 0 oder negativ (z. B. bei falschen Spaltenbreiten)

    // Wörter mit Fett-Angabe und ob davor ein Leerzeichen steht
    const woerter = [];
    let leerDavor = false;
    inline(text).forEach((stueck) => {
        const fett = typeof stueck === "object" ? true : !!grundFett;
        const inhalt = typeof stueck === "object" ? stueck.text : stueck;
        inhalt.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { leerDavor = true; return; }
            woerter.push({ text: w, fett: fett, leerDavor: leerDavor });
            leerDavor = false;
        });
    });

    const zeilen = [[]];
    let x = 0;
    const zeile = () => zeilen[zeilen.length - 1];
    const neueZeile = () => { zeilen.push([]); x = 0; };
    const setzen = (t, fett, mitLeer) => {
        zeile().push({ text: (mitLeer ? " " : "") + t, bold: fett });
        x += (mitLeer ? breiteVon(" ", groesse, fett) : 0) + breiteVon(t, groesse, fett);
    };

    woerter.forEach((w) => {
        let rest = w.text;
        let mitLeer = w.leerDavor && zeile().length > 0;

        while (rest) {
            const leer = mitLeer ? breiteVon(" ", groesse, w.fett) : 0;

            // 1. Passt das (restliche) Wort noch in die Zeile?
            if (x + leer + breiteVon(rest, groesse, w.fett) <= max) {
                setzen(rest, w.fett, mitLeer);
                break;
            }

            // 2. Silbentrennung: möglichst viele Silben in diese Zeile
            const teile = silbenVon(rest);
            let vorne = null, i;
            for (i = teile.length - 1; i >= 1; i--) {
                const kandidat = teile.slice(0, i).join("");
                const strich = kandidat.endsWith("-") ? "" : "-";
                if (x + leer + breiteVon(kandidat + strich, groesse, w.fett) <= max) {
                    vorne = kandidat + strich;
                    break;
                }
            }
            if (vorne) {
                setzen(vorne, w.fett, mitLeer);
                neueZeile();
                rest = teile.slice(i).join("");
                mitLeer = false;
                continue;
            }

            // 3. Keine Silbe passt mehr: neue Zeile und dort nochmal versuchen
            if (zeile().length > 0) {
                neueZeile();
                mitLeer = false;
                continue;
            }

            // 4. Notfall: Wort ohne Trennstelle ist breiter als die Zeile -> nach Zeichen trennen.
            //    Mindestens ein Zeichen pro Zeile, damit es immer weitergeht (keine Endlosschleife).
            if (rest.length === 1) {
                setzen(rest, w.fett, false);
                break;
            }
            let n = rest.length - 1;
            while (n > 1 && breiteVon(rest.slice(0, n) + "-", groesse, w.fett) > max) n--;
            setzen(rest.slice(0, n) + "-", w.fett, false);
            neueZeile();
            rest = rest.slice(n);
        }
    });

    // Zeilen zusammensetzen: gleiche Formatierung zusammenfassen, "\n" zwischen den Zeilen
    const ergebnis = [];
    zeilen.forEach((stuecke, z) => {
        stuecke.forEach((st) => {
            const letztes = ergebnis[ergebnis.length - 1];
            if (letztes && letztes.bold === st.bold && !letztes.text.endsWith("\n")) letztes.text += st.text;
            else ergebnis.push({ text: st.text, bold: st.bold });
        });
        if (z < zeilen.length - 1 && ergebnis.length) ergebnis[ergebnis.length - 1].text += "\n";
    });
    return ergebnis;
}
