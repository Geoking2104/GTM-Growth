# French editorial content for the English-language originals owned by GTM Growth.
module CommunityLocalization
  TAGS = {
    "seo" => ["seo", "Référencement naturel, exploration, indexation et classement dans les résultats de recherche."],
    "geo" => ["geo", "Visibilité dans les moteurs de réponse et citations de sites dans leurs réponses."],
    "ai-visibility" => ["visibilité-ia", "Suivi des mentions et des citations d’une marque par les moteurs d’IA."],
    "social-networks" => ["réseaux-sociaux", "Profils sociaux, liens, publications et mesure des résultats par canal."],
  }.freeze

  def self.configure_site
    SiteSetting.allow_user_locale = true
    SiteSetting.content_localization_enabled = true
    SiteSetting.content_localization_supported_locales = "en|fr"
    SiteSetting.set_locale_from_accept_language_header = true
    SiteSetting.set_locale_from_param = true
    SiteSetting.set_locale_from_cookie = true
    SiteSetting.content_localization_language_switcher = "all"
    {
      "title" => "Communauté GTM Growth",
      "site_description" => "Guides, entraide et idées autour du référencement, de la visibilité IA et des outils sociaux de GTM Growth.",
    }.each do |name, value|
      SiteSettingLocalization.find_or_initialize_by(setting_name: name, locale: "fr").update!(value: value)
    end
  end

  def self.translate_tag(tag)
    name, description = TAGS.fetch(tag.name)
    tag.update!(locale: "en") if tag.locale.blank?
    TagLocalization.find_or_initialize_by(tag: tag, locale: "fr").update!(name: name, description: description)
  end

  def self.translate_category(category, original, actor, github)
    name, description, prompts = case category.slug
    when "knowledge-base"
      ["Base de connaissances", "Retrouvez les guides GTM Growth sur les audits SEO, le référencement dans les moteurs de réponse (GEO), la visibilité IA et les outils sociaux. Consultez la [documentation sur GitHub](#{github}/README.md) ou partagez votre méthode pas à pas."]
    when "troubleshooting"
      ["Entraide", "Besoin d’aide sur un audit, un connecteur ou un rapport ? Précisez l’outil utilisé, le résultat attendu et les étapes qui permettent de reproduire le problème.",
       ["Outil et fonctionnalité", "Résultat attendu", "Résultat obtenu", "Étapes pour reproduire le problème", "Solutions déjà essayées"]]
    when "ideas-board"
      ["Boîte à idées", "Proposez une amélioration de GTM Growth ou votez pour une idée. Expliquez ce que vous aimeriez faire, à qui cela servirait et comment vous en mesureriez l’intérêt.",
       ["Que cherchez-vous à faire ?", "Que changeriez-vous ?", "Comment mesureriez-vous le résultat ?"]]
    else
      raise "Unknown community category: #{category.slug}"
    end
    category.update!(locale: "en") if category.locale.blank?
    CategoryLocalization.find_or_initialize_by(category: category, locale: "fr").update!(name: name, description: description)
    translate_topic(category.topic, actor, "À propos de la rubrique « #{name} »", description) if category.topic

    # Discourse stores one composer template per category. Keep custom moderator edits.
    if prompts && category.topic_template == original.fetch(:topic_template)
      english = original.fetch(:topic_template).scan(/\*\*(.*?)\*\*/).flatten
      raise "Unpaired composer prompts" unless english.length == prompts.length
      category.update!(topic_template: english.zip(prompts).map { |en, fr| "**#{en} / #{fr}**" }.join("\n\n") + "\n")
    end
  end

  def self.translate_guide(topic, actor, github)
    translate_topic(topic, actor, "Trouver le bon guide GTM Growth", <<~MD)
      Consultez le [sommaire de la documentation](#{github}/README.md) ou choisissez le guide adapté à votre objectif.

      | Mon objectif | Guide sur GitHub |
      | --- | --- |
      | Lancer un audit SEO et en interpréter les résultats | [Guide marketing](#{github}/marketing/README.md) |
      | Comprendre le calcul du score GEO d’une page | [Référence de l’audit GEO](#{github}/GEO.md) |
      | Suivre les mentions de ma marque par les moteurs d’IA | [Configurer les fournisseurs d’IA](#{github}/product/AI-VISIBILITY-PROVIDERS.md) |
      | Vérifier un processus de publication sur les réseaux sociaux | [Outils de publication sociale](#{github}/product/SOCIAL-TOOLKIT-SPEC-REVIEW.md) |
      | Connecter ou exploiter la plateforme | [Guide technique](#{github}/technical/README.md) |
    MD
  end

  def self.translate_topic(topic, actor, title, raw)
    post = topic.first_post
    topic.update!(locale: "en") if topic.locale.blank?
    post.update!(locale: "en") if post.locale.blank?
    if post.localizations.exists?(locale: "fr")
      PostLocalizationUpdater.update(post: post, locale: "fr", raw: raw, user: actor)
    else
      PostLocalizationCreator.create(post: post, locale: "fr", raw: raw, user: actor)
    end
    if TopicLocalization.exists?(topic: topic, locale: "fr")
      TopicLocalizationUpdater.update(topic: topic, locale: "fr", title: title, user: actor)
    else
      TopicLocalizationCreator.create(topic: topic, locale: "fr", title: title, user: actor)
    end
  end
end
