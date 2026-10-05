# Blättern (Seiten 1, 2, 3 …) für "Aktuelles" und "Ergebnisse"
#
# Eine Seite bekommt das Blättern über ihre Front Matter, z. B.:
#
#   seiten:
#     quelle: aktuelles     # oder: ergebnisse
#     pro_seite: 5
#
# Seite 1 bleibt unter der normalen Adresse (/aktuelles/),
# weitere Seiten entstehen automatisch: /aktuelles/seite/2/ usw.
# Im Layout steht die Liste dann in page.seiten.eintraege.

module Seiten
  class Generator < Jekyll::Generator
    safe true
    priority :lowest   # erst nachdem Aktuelles/Ergebnisse eingelesen sind

    def generate(site)
      site.pages.dup.each do |seite|
        einstellung = seite.data["seiten"]
        next unless einstellung.is_a?(Hash)

        eintraege = quelle(site, einstellung["quelle"])
        pro_seite = [einstellung["pro_seite"].to_i, 1].max
        gruppen   = eintraege.each_slice(pro_seite).to_a
        gruppen   = [[]] if gruppen.empty?
        basis     = seite.url

        gruppen.each_with_index do |gruppe, i|
          nummer = i + 1
          ziel = nummer == 1 ? seite : kopie(site, seite, basis, nummer)

          ziel.data["seiten"] = einstellung.merge(
            "eintraege"     => gruppe,
            "seite"         => nummer,
            "anzahl_seiten" => gruppen.length,
            "zurueck_url"   => nummer > 1 ? adresse(basis, nummer - 1) : nil,
            "weiter_url"    => nummer < gruppen.length ? adresse(basis, nummer + 1) : nil,
            "alle_urls"     => (1..gruppen.length).map { |n| adresse(basis, n) }
          )
        end
      end
    end

    private

    def quelle(site, name)
      case name
      when "aktuelles"
        site.collections["aktuelles"].docs.sort_by { |d| d.data["date"] }.reverse
      when "ergebnisse"
        site.data["ergebnisse"] || []
      else
        Jekyll.logger.warn "Seiten:", "Unbekannte Quelle '#{name}'"
        []
      end
    end

    def adresse(basis, nummer)
      nummer == 1 ? basis : "#{basis}seite/#{nummer}/"
    end

    # Gleiche .md-Datei noch einmal einlesen, nur mit anderer Adresse
    def kopie(site, original, basis, nummer)
      quellordner = File.dirname(original.relative_path)   # z. B. "pages"
      neu = Jekyll::Page.new(site, site.source, quellordner, original.name)
      neu.data["permalink"] = adresse(basis, nummer)
      site.pages << neu
      neu
    end
  end
end
