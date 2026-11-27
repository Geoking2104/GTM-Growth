# Verify the contact's first login through the same provider used by the web wizard.
exit 0 unless SiteSetting.has_login_hint?
host = "forum.gtmgrowth.kayroslab.com"
abort "Unexpected forum hostname" unless Discourse.current_hostname == host
SiteSetting.force_https = true unless SiteSetting.force_https?
abort "Incorrect OAuth callback origin" unless Discourse.base_url == "https://#{host}"

unless Auth::DiscourseIdAuthenticator.new.configured?
  result = DiscourseId::Register.call
  unless result.success?
    failure = result.error.to_s
    failures = {
      /redirect uri must use https/i => "Provider requires an HTTPS callback",
      /already registered|already exists/i => "This forum is already registered with the provider",
      /challenge token|challenge verification|verify.*domain|verification failed/i => "Provider could not validate the forum's challenge",
      /connection refused|failed to open tcp/i => "Provider connection failed",
      /timed? ?out|Net::(?:Open|Read)Timeout/i => "Provider request timed out",
      /getaddrinfo|name or service not known|name resolution/i => "Provider DNS lookup failed",
      /certificate verify failed|SSL_connect/i => "Provider TLS verification failed",
      /too many requests|rate.limit/i => "Provider rate limit"
    }
    warn failures.find { |pattern, _| pattern.match?(failure) }&.last || "Provider registration failed"
    match = failure.match(%r{Request to '(/challenge|/register)' failed: (\d{3})})
    warn "Provider #{match[1]} returned HTTP #{match[2]}" if match
    abort "The first administrator cannot sign in with Discourse ID yet."
  end
end
SiteSetting.enable_discourse_id = true unless SiteSetting.enable_discourse_id?
puts "Discourse ID is configured for the forum."
