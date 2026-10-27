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

import { umbrechen, textBreite } from "./umbruch.js";


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
        ja_nein:        { groesse: 10, farbe: "text", abstand_oben: 12, abstand_unten: 6 },
        frage:          { groesse: 10, farbe: "text", abstand_oben: 12, abstand_unten: 6 },
        aussage:        { groesse: 10, farbe: "text" },
        tabellenkopf:   { groesse: 7.5, fett: true, farbe: "petrol", zeilenhoehe: 1.1 },
        freitext_frage: { groesse: 11, fett: true, farbe: "petrol", abstand_unten: 4 }
    },
    kaestchen: { groesse: 10, linienstaerke: 0.8, farbe: "grau" },
    code: { linie_breite: 200, linienstaerke: 0.8, farbe: "grau", abstand: 8 },
    zahl: { linie_breite: 60, linienstaerke: 0.8, farbe: "grau", abstand: 8 },
    auswahl: { abstand_optionen: 22, abstand_frage: 2, andere_linie: 120, linienstaerke: 0.8, farbe: "grau" },
    einschaetzung: { stufe_breite: 30, zahlen: false, zahlen_groesse: 8, zahlen_farbe: "grau", abstand_frage: 2, abstand_beschriftung: 8 },
    aussagen_tabelle: {
        skala_spalte: 56, text_mindestbreite: 150, zellabstand: 6, abstand_oben: 6, abstand_unten: 12,
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

// Schreiblinie zum Ausfüllen (Code, Zahl); liegt auf Höhe der Textgrundlinie
function schreiblinie(cfg) {
    const y = textStil("frage").groesse * 1.15;
    return {
        width: cfg.linie_breite,
        canvas: [{ type: "line", x1: 0, y1: y, x2: cfg.linie_breite, y2: y,
                   lineWidth: cfg.linienstaerke, lineColor: farbe(cfg.farbe) }]
    };
}

// Frage, direkt dahinter die Schreiblinie ("auto" = Frage nur so breit wie ihr Text)
function frageMitLinie(text, cfg, breite) {
    return {
        style: "frage",
        columnGap: cfg.abstand,
        columns: [
            { text: gesetzt(text, breite - cfg.linie_breite - cfg.abstand, "frage"), width: "auto" },
            schreiblinie(cfg)
        ]
    };
}

// Auswahl-Optionen unter der Frage.
// - Zwei Optionen (z. B. Ja/Nein): kompakt nebeneinander "☐ Ja   ☐ Nein"
// - Ab drei Optionen: Raster aus gleich breiten Spalten über die ganze Zeilenbreite.
//   Bei mehreren Zeilen stehen die Kästchen genau untereinander.
function optionenZeilen(optionen, breite) {
    const A = STIL.auswahl;
    const K = STIL.kaestchen.groesse;
    const f = textStil("frage");
    const RESERVE = 4;                                  // pdfmake misst minimal anders

    // 1. Jede Option vorbereiten und ihre Breite messen
    const eintraege = optionen.map((roh) => {
        // "anderen Bereich: ___" -> Option mit Schreiblinie dahinter
        const mitLinie = /_{3,}\s*$/.test(roh);
        const option   = roh.replace(/_{3,}\s*$/, "").trim();
        const linie    = mitLinie ? 4 + A.andere_linie : 0;
        const textMax  = breite - K - 5 - linie;

        const teile = [kaestchen(), { text: gesetzt(option, textMax, "frage"), width: "auto", margin: [5, 0, 0, 0] }];
        if (mitLinie) {
            teile.push(Object.assign(
                schreiblinie({ linie_breite: A.andere_linie, linienstaerke: A.linienstaerke, farbe: A.farbe }),
                { margin: [4, 0, 0, 0] }
            ));
        }
        return {
            breite: Math.min(K + 5 + textBreite(option, f.groesse, !!f.fett) + linie + RESERVE, breite),
            // columnGap: 0 nötig, sonst erbt pdfmake den Abstand zwischen den Optionen
            // und setzt ihn auch zwischen Kästchen, Text und Linie
            inhalt: { columns: teile, columnGap: 0 }
        };
    });

    const zeile = (spalten, i) => ({
        columns: spalten,
        columnGap: A.abstand_optionen,
        margin: [0, i === 0 ? A.abstand_frage : 4, 0, 0]
    });

    // 2a. Zwei oder weniger Optionen: kompakt, so breit wie nötig
    if (eintraege.length <= 2) {
        return [zeile(eintraege.map((e) => Object.assign({ width: "auto" }, e.inhalt)), 0)];
    }

    // 2b. Raster: so viele Spalten, wie die längste Option zulässt ...
    const laengste = Math.max.apply(null, eintraege.map((e) => e.breite));
    let spalten = 1;
    for (let k = eintraege.length; k >= 1; k--) {
        if ((breite - (k - 1) * A.abstand_optionen) / k >= laengste) { spalten = k; break; }
    }
    // ... und gleichmäßig verteilt (2 + 2 statt 3 + 1)
    const zeilenAnzahl = Math.ceil(eintraege.length / spalten);
    spalten = Math.ceil(eintraege.length / zeilenAnzahl);

    // 3. Zeilen bauen; letzte Zeile mit leeren Spalten auffüllen, damit alle gleich breit sind
    const zeilen = [];
    for (let i = 0; i < eintraege.length; i += spalten) {
        const zellen = eintraege.slice(i, i + spalten).map((e) => Object.assign({ width: "*" }, e.inhalt));
        while (zellen.length < spalten) zellen.push({ width: "*", text: "" });
        zeilen.push(zeile(zellen, zeilen.length));
    }
    return zeilen;
}

// Einschätzung: "sehr unsicher  ☐ ☐ ☐ ☐ ☐  sehr sicher"
// (mit "zahlen: true" in der YAML stehen 1…n über den Kästchen)
function einschaetzungZeile(links, rechts, stufen) {
    const E = STIL.einschaetzung;
    const f = textStil("frage");
    const zahlenHoehe = E.zahlen ? E.zahlen_groesse * 1.4 : 0;   // Platz der Zahlenzeile über den Kästchen

    const spalten = [];
    if (links) spalten.push({ text: links, width: "auto", margin: [0, zahlenHoehe, E.abstand_beschriftung, 0] });
    for (let i = 1; i <= stufen; i++) {
        spalten.push({
            width: E.stufe_breite,
            stack: (E.zahlen
                ? [{ text: String(i), alignment: "center", fontSize: E.zahlen_groesse, color: farbe(E.zahlen_farbe), lineHeight: 1 }]
                : []
            ).concat([{ stack: [kaestchen()], alignment: "center", margin: [0, E.zahlen ? 2 : 0, 0, 0] }])
        });
    }
    if (rechts) spalten.push({ text: rechts, width: "auto", margin: [E.abstand_beschriftung, zahlenHoehe, 0, 0] });

    return { columns: spalten, columnGap: 0, fontSize: f.groesse, margin: [0, E.abstand_frage, 0, 0] };
}

function dokumentBauen(teile, logoSvg, kopfzeile) {
    const R          = STIL.seite;
    const SEITENRAND = [R.rand_links, R.rand_oben, R.rand_rechts, R.rand_unten];
    const BREITE     = A4_BREITE - R.rand_links - R.rand_rechts;   // nutzbare Breite

    const inhalt = [];
    let nummer = 0;

    // Seitenumbruch: der nächste Baustein beginnt auf einer neuen Seite
    let neueSeite = false;

    teile.forEach((t) => {
        if (t.typ === "seitenumbruch") {
            neueSeite = inhalt.length > 0;      // nicht vor dem allerersten Baustein
            return;
        }
        const start = inhalt.length;

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

        case "janein":
            // wie eine Auswahl mit den Optionen "Ja" und "Nein": Kästchen unter der Frage
            inhalt.push({
                style: "ja_nein",
                stack: [{ text: gesetzt(t.text, BREITE, "ja_nein") }].concat(optionenZeilen(["Ja", "Nein"], BREITE))
            });
            break;

        case "code":
            inhalt.push(frageMitLinie(t.text, STIL.code, BREITE));
            break;

        case "zahl":
            inhalt.push(frageMitLinie(t.text, STIL.zahl, BREITE));
            break;

        case "auswahl":
            inhalt.push({
                style: "frage",
                stack: [{ text: gesetzt(t.text, BREITE, "frage") }].concat(optionenZeilen(t.optionen, BREITE))
            });
            break;

        case "einschaetzung":
            inhalt.push({
                style: "frage",
                stack: [
                    { text: gesetzt(t.text, BREITE, "frage") },
                    einschaetzungZeile(t.links, t.rechts, t.stufen)
                ]
            });
            break;

        case "likert": {
            const T = STIL.aussagen_tabelle;
            const kopf = [{ text: "Aussage", style: "tabellenkopf", alignment: "left" }]
                .concat(t.skala.map((s) => ({ text: s, style: "tabellenkopf" })));

            // Spaltenbreiten: Bei vielen Skalen-Stufen werden die Skalen-Spalten schmaler,
            // damit für den Text mindestens "text_mindestbreite" bleibt.
            const anzahl  = t.skala.length;
            const innen   = 6 + (anzahl - 1) * 8 + 2;        // Innenabstände (siehe layout unten)
            const textMin = Math.min(T.text_mindestbreite, BREITE / 2);
            const spalte  = Math.max(STIL.kaestchen.groesse + 4,
                                     Math.min(T.skala_spalte, (BREITE - textMin - innen) / anzahl));
            const textSpalte = BREITE - anzahl * spalte - innen;

            // Höhe einer Textzeile im PDF: Schriftgröße × Zeilenhöhe × 1,172
            // (1,172 = natürliche Zeilenhöhe der Schrift Roboto, wie pdfmake sie verwendet)
            const a = textStil("aussage");
            const zeilenHoehe = a.groesse * a.zeilenhoehe * 1.172;

            const zeilen = t.aussagen.map((aussage) => {
                nummer++;
                const text = gesetzt(nummer + ".  " + aussage, textSpalte, "aussage");

                // pdfmake kann Zellen nicht vertikal zentrieren. Da wir den Umbruch selbst
                // machen, kennen wir die Zeilenzahl und schieben die Kästchen in die Mitte.
                const textZeilen = 1 + text.reduce((summe, st) => summe + (st.text ? (st.text.match(/\n/g) || []).length : 0), 0);
                const oben = Math.max(0, (textZeilen * zeilenHoehe - STIL.kaestchen.groesse) / 2 - 1);   // -1: Kästchen ist 1 pt nach unten versetzt

                return [{ text: text, style: "aussage" }]
                    .concat(t.skala.map(() => ({ stack: [kaestchen()], alignment: "center", margin: [0, oben, 0, 0] })));
            });

            inhalt.push({
                margin: [0, T.abstand_oben, 0, T.abstand_unten],
                table: {
                    headerRows: 1,                 // Kopf wiederholt sich auf jeder Seite
                    dontBreakRows: true,
                    widths: ["*"].concat(t.skala.map(() => spalte)),
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
        if (neueSeite && inhalt.length > start) {
            inhalt[start].pageBreak = "before";
            neueSeite = false;
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
