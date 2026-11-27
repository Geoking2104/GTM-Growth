# Configure this forum using Discourse's own models and branding uploads.
require "cgi"

abort "Unexpected forum" unless Discourse.current_hostname == "forum.gtmgrowth.kayroslab.com"
root = File.dirname(__FILE__)
actor = Discourse.system_user
github = "https://github.com/Geoking2104/GTM-Growth/blob/main/docs"

def upload_asset(path, options)
  File.open(path, "rb") do |file|
    upload = UploadCreator.new(file, File.basename(path), options).create_for(Discourse.system_user.id)
    raise "Upload failed for #{File.basename(path)}: #{upload.errors.full_messages.join(', ')}" unless upload.persisted?
    upload
  end
end

logo = upload_asset(File.join(root, "logo-rocket.png"), type: "branding")
font = upload_asset(File.join(root, "InterVariable.woff2"), for_theme: true)
categories = [
  {
    name: "Knowledge Base", slug: "knowledge-base", color: "6935DC",
    description: "Find GTM Growth guides for SEO audits, generative engine optimization (GEO), AI visibility, and social tools. Browse the [documentation on GitHub](#{github}/README.md) or share a walkthrough that others can reproduce.",
  },
  {
    name: "Troubleshooting", slug: "troubleshooting", color: "087E84",
    description: "Get help with an audit, a connector, or a report. Name the tool, describe what you expected, and share the steps that reproduce the issue.",
    topic_template: "**Tool and feature**\n\n**What I expected**\n\n**What happened**\n\n**Steps to reproduce**\n\n**What I have already tried**\n",
  },
  {
    name: "Ideas Board", slug: "ideas-board", color: "C23878",
    description: "Propose an improvement to GTM Growth or vote on an existing idea. Describe the task, who would benefit, and how you would measure the improvement.",
    topic_template: "**What are you trying to do?**\n\n**What would you change?**\n\n**How would you know it helped?**\n",
  },
]
tags = {
  "seo" => "Search engine optimization, crawling, indexing, and organic rankings.",
  "geo" => "Generative engine optimization and how answer engines cite a site.",
  "ai-visibility" => "Tracking mentions and citations across AI providers.",
  "social-networks" => "Social profiles, social links, publishing, and channel measurement.",
}
ActiveRecord::Base.transaction do
  SiteSetting.title = "GTM Growth Community"
  SiteSetting.site_description = "Guides, troubleshooting, and ideas for GTM Growth search, AI visibility, and social tools."
  %i[logo mobile_logo logo_small logo_dark mobile_logo_dark logo_small_dark favicon apple_touch_icon large_icon manifest_icon].each do |setting|
    SiteSetting.public_send("#{setting}=", logo) unless SiteSetting.public_send(setting)&.id == logo.id
  end

  SiteSetting.tagging_enabled = true unless SiteSetting.tagging_enabled?
  tags.each { |name, description| Tag.find_or_create_by!(name: name) { |tag| tag.description = description } }
  records = categories.map do |attrs|
    category = Category.find_by(parent_category_id: nil, slug: attrs.fetch(:slug))
    if category
      raise "Category name or visibility conflict for #{attrs[:slug]}" if category.name != attrs[:name] || category.read_restricted?
    else
      category = CategoryCreator.create(Guardian.new(actor), attrs.merge(text_color: "FFFFFF", permissions: { everyone: :full }))
      raise "Category creation failed: #{category.errors.full_messages.join(', ')}" unless category.persisted?
    end
    category
  end
  kb, _, ideas = records
  SiteSetting.topic_voting_enabled = true unless SiteSetting.topic_voting_enabled?
  DiscourseTopicVoting::CategorySetting.find_or_create_by!(category_id: ideas.id)

  # Preserve any existing sidebar defaults and each member's own choices.
  sidebar = SiteSetting.default_navigation_menu_categories.to_s.split("|")
  SiteSetting.default_navigation_menu_categories = (sidebar | records.map { |c| c.id.to_s }).join("|")
  guide_key = "gtm_growth_documentation_index"
  unless TopicCustomField.exists?(name: guide_key, value: "1")
    guide = PostCreator.create!(actor, title: "Find the right GTM Growth guide", category: kb.id,
      tags: tags.keys, raw: <<~MD)
      Start with the [documentation hub](#{github}/README.md), or jump to the guide that matches your task.

      | I want to… | Read on GitHub |
      | --- | --- |
      | Run a search audit and interpret the results | [Marketing guide](#{github}/marketing/README.md) |
      | Understand how a GEO audit scores a page | [GEO audit reference](#{github}/GEO.md) |
      | Track how AI providers mention a brand | [AI visibility provider setup](#{github}/product/AI-VISIBILITY-PROVIDERS.md) |
      | Review a social publishing workflow | [Social toolkit review](#{github}/product/SOCIAL-TOOLKIT-SPEC-REVIEW.md) |
      | Connect or operate the platform | [Technical guide](#{github}/technical/README.md) |
    MD
    guide.topic.update_pinned(true, false)
    guide.topic.custom_fields[guide_key] = "1"
    guide.topic.save_custom_fields
  end

  component = Theme.find_or_initialize_by(name: "GTM Growth Community", component: true)
  component.user_id ||= actor.id
  component.save! if component.new_record?
  component.set_field(target: :common, name: "gtm_inter", type: :theme_upload_var, upload_id: font.id)
  component.set_field(target: :common, name: :scss, value: File.read(File.join(root, "community.scss")))
  links = records.map do |c|
    %(<a class="gtm-#{c.slug}" href="#{CGI.escapeHTML(c.url)}">#{CGI.escapeHTML(c.name)}</a>)
  end
  component.set_field(target: :common, name: :after_header, value:
    %(<nav class="gtm-community-links" aria-label="Community categories"><div class="wrap">#{links.join}</div></nav>))
  component.save!
  Theme.user_selectable.where(component: false, enabled: true).each do |parent|
    parent.add_relative_theme!(:child, component) unless parent.child_themes.exists?(component.id)
  end
  raise "Theme component is missing from the default theme" unless Theme.find_default.child_themes.exists?(component.id)
end
puts "Community branding, public categories, documentation index, topic tags, and idea voting applied."
