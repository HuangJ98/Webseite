# Liest alle Dateien aus assets/ergebnisse/ ein und stellt sie der
# Seite "Ergebnisse" als site.data["ergebnisse"] zur Verfügung.
#
# Dateiname:  JJJJ-MM-TT-Name-der-Datei.pdf
#   -> Datum:  aus dem Dateinamen (TT.MM.JJJJ)
#   -> Name:   "Name der Datei" (Bindestriche werden zu Leerzeichen)
#   -> Größe:  automatisch, z. B. "1,2 MB"
#   -> Typ:    aus der Endung, z. B. "PDF"
#
# Ohne Datum im Namen wird das Änderungsdatum der Datei genommen.
# Auf GitHub ist das aber das Datum des Builds, deshalb Datum in den
# Dateinamen schreiben.

module Ergebnisse
  ORDNER = "assets/ergebnisse".freeze
  DATUM_IM_NAMEN = /\A(\d{4})-(\d{2})-(\d{2})-(.+)\z/

  class Generator < Jekyll::Generator
    safe true
    priority :low

    def generate(site)
      dateien = site.static_files.select do |f|
        f.relative_path.sub(%r{\A/}, "").start_with?("#{ORDNER}/")
      end

      # Neueste zuerst; bei gleichem Datum alphabetisch (Ergebnis 1, 2, 3 …)
      site.data["ergebnisse"] = dateien.map { |f| eintrag(f) }
                                       .sort_by { |e| [-e["date"].to_i, e["name"]] }
    end

    private

    def eintrag(datei)
      basis = File.basename(datei.name, datei.extname)

      if (m = DATUM_IM_NAMEN.match(basis))
        datum = Time.new(m[1].to_i, m[2].to_i, m[3].to_i)
        basis = m[4]
      else
        datum = File.mtime(datei.path)
      end

      {
        "name" => basis.tr("-_", "  ").strip,
        "url"  => datei.url,
        "date" => datum,
        "size" => groesse(File.size(datei.path)),
        "type" => datei.extname.delete(".").upcase
      }
    end

    # 1536 -> "1,5 KB", 2_400_000 -> "2,3 MB"
    def groesse(bytes)
      einheiten = %w[B KB MB GB]
      wert = bytes.to_f
      i = 0
      while wert >= 1024 && i < einheiten.length - 1
        wert /= 1024
        i += 1
      end
      zahl = i.zero? ? wert.round.to_s : format("%.1f", wert).sub(".", ",")
      "#{zahl} #{einheiten[i]}"
    end
  end
end
