/* =========================================================
   FRAGEBOGEN ③ PDF BAUEN
   ---------------------------------------------------------
   Macht aus den Bausteinen (markdown.js) mit dem Aussehen aus
   _data/fragebogen_stil.yml ein PDF (pdfmake).

   - stilLaden(): YAML-Werte (als JSON) übernehmen
   - pdfErzeugen(): Bausteine -> PDF-Datei (Uint8Array)

   Neuer Fragetyp: in dokumentBauen() einen weiteren "case" ergänzen.

   Braucht: pdfMake (als <script> geladen)
   ========================================================= */

import { umbrechen } from "./umbruch.js";


/* ---------- Aussehen: kommt aus _data/fragebogen_stil.yml ---------- */

// Standardwerte, falls in der YAML etwas fehlt (gleiche Werte wie dort)
const STANDARD = {
    farben: { petrol: "#1e5a5a", text: "#222222", grau: "#555555", linie: "#dddddd", kasten: "#cccccc" },
    seite: { rand_links: 60, rand_rechts: 60, rand_oben: 80, rand_unten: 60 },
    grundschrift: { groesse: 10, farbe: "text", zeilenhoehe: 1.25 },
    texte: {
        titel:          { groesse: 20, fett: true, farbe: "petrol", abstand_unten: 10 },
        absatz:         { groesse: 10, farbe: "grau", abstand_unten: 6 },
        ueberschrift:   { groesse: 12, fett: true, farbe: "petrol", abstand_oben: 14, abstand_unten: 4 },
        ja_nein:        { groesse: 10, farbe: "text", abstand_oben: 8, abstand_unten: 8 },
        aussage:        { groesse: 10, farbe: "text" },
        tabellenkopf:   { groesse: 7.5, fett: true, farbe: "petrol", zeilenhoehe: 1.1 },
        freitext_frage: { groesse: 11, fett: true, farbe: "petrol", abstand_unten: 4 }
    },
    kaestchen: { groesse: 10, linienstaerke: 0.8, farbe: "grau" },
    ja_nein: { breite: 90, abstand: 16 },
    aussagen_tabelle: {
        skala_spalte: 56, zellabstand: 6, abstand_oben: 6, abstand_unten: 12,
        linie_kopf: { staerke: 1.2, farbe: "petrol" },
        linie_zeilen: { staerke: 0.6, farbe: "linie" }
    },
    freitext: { kasten_hoehe: 140, linienstaerke: 0.8, farbe: "kasten", abstand_oben: 14 },
    kopfzeile: { groesse: 8.5, farbe: "grau", logo_breite: 54, linie: { staerke: 0.6, farbe: "linie" } },
    fusszeile: { groesse: 8.5, farbe: "grau" }
};

const A4_BREITE = 595.28;   // pt

let STIL = STANDARD;


// YAML-Werte über die Standardwerte legen (auch verschachtelt)
function mischen(basis, extra) {
    const ergebnis = Object.assign({}, basis);
    Object.keys(extra || {}).forEach((k) => {
        const b = basis[k], e = extra[k];
        ergebnis[k] = b && typeof b === "object" && !Array.isArray(b) && e && typeof e === "object"
            ? mischen(b, e) : e;
    });
    return ergebnis;
}

// JSON-Text aus der Seite (von Jekyll aus der YAML erzeugt) übernehmen
export function stilLaden(jsonText) {
    try {
        STIL = mischen(STANDARD, JSON.parse(jsonText));
    } catch (e) {
        console.warn("fragebogen_stil.yml konnte nicht gelesen werden, Standardwerte werden benutzt:", e);
        STIL = STANDARD;
    }
}

// Farbname ("petrol") oder Hex-Code ("#1e5a5a")
const farbe = (name) => STIL.farben[name] || name;

// Einstellungen eines Textes aus "texte:" (mit Grundschrift als Basis)
function textStil(name) {
    return Object.assign({}, STIL.grundschrift, STIL.texte[name]);
}

// Für pdfmake: Textstil aus der YAML übersetzen
function pdfStil(name) {
    const t = textStil(name);
    return {
        fontSize: t.groesse,
        bold: !!t.fett,
        color: farbe(t.farbe),
        lineHeight: t.zeilenhoehe,
        margin: [0, t.abstand_oben || 0, 0, t.abstand_unten || 0]
    };
}

// Text für einen Stil umbrechen (Größe und fett kommen aus der YAML)
function gesetzt(text, breite, stilName) {
    const t = textStil(stilName);
    return umbrechen(text, breite, t.groesse, !!t.fett);
}


/* ---------- Bausteine ---------- */

// Leeres Ankreuz-Kästchen als Vektorgrafik
function kaestchen() {
    const K = STIL.kaestchen;
    return {
        canvas: [{ type: "rect", x: 0, y: 1, w: K.groesse, h: K.groesse,
                   lineWidth: K.linienstaerke, lineColor: farbe(K.farbe) }],
        width: K.groesse
    };
}

function dokumentBauen(teile, logoSvg, kopfzeile) {
    const R          = STIL.seite;
    const SEITENRAND = [R.rand_links, R.rand_oben, R.rand_rechts, R.rand_unten];
    const BREITE     = A4_BREITE - R.rand_links - R.rand_rechts;   // nutzbare Breite

    const inhalt = [];
    let nummer = 0;

    teile.forEach((t) => {
        switch (t.typ) {

        case "titel":
            inhalt.push({ text: gesetzt(t.text, BREITE, "titel"), style: "titel" });
            break;

        case "absatz":
            inhalt.push({ text: gesetzt(t.text, BREITE, "absatz"), style: "absatz" });
            break;

        case "ueberschrift":
            inhalt.push({ text: gesetzt(t.text, BREITE, "ueberschrift"), style: "ueberschrift" });
            break;

        case "janein": {
            const JN = STIL.ja_nein;
            inhalt.push({
                style: "ja_nein",
                columnGap: JN.abstand,
                columns: [
                    { text: gesetzt(t.text, BREITE - JN.breite - JN.abstand, "ja_nein"), width: "*" },
                    {
                        // "auto" = so breit wie der Inhalt: "Nein" endet bündig mit dem rechten
                        // Ende der Tabelle. Der Text links ist auf JN.breite weniger umbrochen,
                        // daher wird dieser Bereich nie zusammengedrückt.
                        width: "auto",
                        columns: [
                            kaestchen(), { text: "Ja", width: "auto", margin: [5, 0, 18, 0] },
                            kaestchen(), { text: "Nein", width: "auto", margin: [5, 0, 0, 0] }
                        ]
                    }
                ]
            });
            break;
        }

        case "likert": {
            const T = STIL.aussagen_tabelle;
            const kopf = [{ text: "Aussage", style: "tabellenkopf", alignment: "left" }]
                .concat(t.skala.map((s) => ({ text: s, style: "tabellenkopf" })));

            // Breite der Textspalte = Seite minus Skalen-Spalten minus Innenabstände (siehe layout)
            const textSpalte = BREITE - t.skala.length * T.skala_spalte - (6 + (t.skala.length - 1) * 8 + 2);

            const zeilen = t.aussagen.map((aussage) => {
                nummer++;
                return [{ text: gesetzt(nummer + ".  " + aussage, textSpalte, "aussage"), style: "aussage" }]
                    .concat(t.skala.map(() => ({ stack: [kaestchen()], alignment: "center", margin: [0, 2, 0, 0] })));
            });

            inhalt.push({
                margin: [0, T.abstand_oben, 0, T.abstand_unten],
                table: {
                    headerRows: 1,                 // Kopf wiederholt sich auf jeder Seite
                    dontBreakRows: true,
                    widths: ["*"].concat(t.skala.map(() => T.skala_spalte)),
                    body: [kopf].concat(zeilen)
                },
                layout: {
                    hLineWidth: (i) => (i === 0 ? 0 : i === 1 ? T.linie_kopf.staerke : T.linie_zeilen.staerke),
                    hLineColor: (i) => farbe(i === 1 ? T.linie_kopf.farbe : T.linie_zeilen.farbe),
                    vLineWidth: () => 0,
                    // erste/letzte Spalte ohne Innenabstand: Text steht auf der Linie des Seitenrands
                    paddingLeft:  (i) => (i === 0 ? 0 : 2),
                    paddingRight: (i, node) => (i === node.table.widths.length - 1 ? 0 : 6),
                    paddingTop:    () => T.zellabstand,
                    paddingBottom: () => T.zellabstand
                }
            });
            break;
        }

        case "freitext": {
            const F = STIL.freitext;
            inhalt.push({
                unbreakable: true,                 // Frage und Kasten nicht trennen
                margin: [0, F.abstand_oben, 0, 6],
                stack: [
                    { text: gesetzt(t.text, BREITE, "freitext_frage"), style: "freitext_frage" },
                    t.beschreibung ? { text: gesetzt(t.beschreibung, BREITE, "absatz"), style: "absatz" } : "",
                    {
                        canvas: [{ type: "rect", x: 0, y: 0, w: BREITE, h: F.kasten_hoehe,
                                   lineWidth: F.linienstaerke, lineColor: farbe(F.farbe) }],
                        margin: [0, 6, 0, 0]
                    }
                ]
            });
            break;
        }
        }
    });

    const KZ = STIL.kopfzeile;
    const FZ = STIL.fusszeile;

    // alle Textstile aus "texte:" in der YAML; Tabellenkopf zusätzlich zentriert
    const stile = {};
    Object.keys(STIL.texte).forEach((name) => { stile[name] = pdfStil(name); });
    stile.tabellenkopf = Object.assign(pdfStil("tabellenkopf"), { alignment: "center" });

    return {
        pageSize: "A4",
        pageMargins: SEITENRAND,
        info: { title: "EditA Fragebogen", author: "EditA" },

        header: () => ({
            margin: [SEITENRAND[0], 30, SEITENRAND[2], 0],
            stack: [
                {
                    columns: [
                        { text: kopfzeile, fontSize: KZ.groesse, color: farbe(KZ.farbe), margin: [0, 8, 0, 0] },
                        logoSvg ? { svg: logoSvg, width: KZ.logo_breite } : { text: "" }
                    ],
                    columnGap: 10
                },
                { canvas: [{ type: "line", x1: 0, y1: 6, x2: BREITE, y2: 6,
                             lineWidth: KZ.linie.staerke, lineColor: farbe(KZ.linie.farbe) }] }
            ]
        }),

        footer: (seite, anzahl) => ({
            text: "Seite " + seite + " von " + anzahl,
            alignment: "right", fontSize: FZ.groesse, color: farbe(FZ.farbe),
            margin: [SEITENRAND[0], 20, SEITENRAND[2], 0]
        }),

        content: inhalt,

        defaultStyle: {
            font: "Roboto",
            fontSize: STIL.grundschrift.groesse,
            color: farbe(STIL.grundschrift.farbe),
            lineHeight: STIL.grundschrift.zeilenhoehe
        },
        styles: stile
    };
}


// Bausteine -> fertige PDF-Datei
// optionen: { logoSvg: Text der SVG-Datei oder null, kopfzeile: Text oben links }
export function pdfErzeugen(teile, optionen) {
    const doc = dokumentBauen(teile, optionen.logoSvg, optionen.kopfzeile || "");
    return new Promise((fertig, fehler) => {
        try {
            pdfMake.createPdf(doc).getBuffer((buffer) => fertig(new Uint8Array(buffer)));
        } catch (e) {
            fehler(e);
        }
    });
}
