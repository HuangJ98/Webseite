# Beiträge für "Aktuelles": ein Ordner pro Beitrag
#
#   _aktuelles/
#     2026-10-01-altenpflege-2026/
#       beitrag.md     <- Titel, Teaser, Text
#       bild.jpg       <- beliebiger Name, jpg/jpeg/png/webp/gif
#
# Aus dem Ordnernamen werden automatisch gesetzt:
#   Datum:   2026-10-01
#   Adresse: /aktuelles/altenpflege-2026/
# Das Bild im Ordner wird automatisch gefunden.
# Ordner, die mit _ beginnen (z. B. _vorlage), werden nicht veröffentlicht.

module Aktuelles
  ORDNER_MIT_DATUM = /\A(\d{4})-(\d{2})-(\d{2})-(.+)\z/
  BILD_ENDUNGEN = %w[.jpg .jpeg .png .webp .gif].freeze

  class Generator < Jekyll::Generator
    safe true
    priority :highest

    def generate(site)
      sammlung = site.collections["aktuelles"]
      return unless sammlung

      # Vorlagen-Ordner (_vorlage usw.) nicht veröffentlichen
      sammlung.docs.reject! { |doc| ordner_von(doc).start_with?("_") }
      sammlung.files.reject! { |f| f.relative_path.split("/").any? { |teil| teil.start_with?("_") && teil != "_aktuelles" } }

      sammlung.docs.each do |doc|
        ordner = ordner_von(doc)
        m = ORDNER_MIT_DATUM.match(ordner)

        if m
          doc.data["date"] = Time.new(m[1].to_i, m[2].to_i, m[3].to_i)
          doc.data["permalink"] ||= "/aktuelles/#{m[4]}/"
        else
          doc.data["permalink"] ||= "/aktuelles/#{ordner}/"
        end

        doc.data["image"] ||= bild_im_ordner(sammlung, doc)
        doc.data["image_alt"] ||= doc.data["title"]
      end
    end

    private

    def ordner_von(doc)
      File.basename(File.dirname(doc.path))
    end

    def bild_im_ordner(sammlung, doc)
      ordner = File.dirname(doc.path)
      bild = sammlung.files.find do |f|
        File.dirname(f.path) == ordner &&
          BILD_ENDUNGEN.include?(f.extname.downcase)
      end
      bild&.url
    end
  end
end
