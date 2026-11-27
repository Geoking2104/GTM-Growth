# Run through the protected production job. The owner supplies the password on stdin.
email = "contact@kayroslab.com"
abort "Unexpected forum" unless Discourse.current_hostname == "forum.gtmgrowth.kayroslab.com"
abort "Unexpected administrator configuration" unless GlobalSetting.developer_emails.to_s.split(",").map(&:strip).include?(email)
password = STDIN.read(2048).force_encoding("UTF-8")
minimum = [16, SiteSetting.min_admin_password_length, SiteSetting.min_password_length].max
abort "A single-line password satisfying the forum's length requirements is required." unless
  password.valid_encoding? && password.size.between?(minimum, UserPassword::MAX_PASSWORD_LENGTH) && !password.match?(/[\r\n\0]/)

User.transaction do
  User.connection.execute("SELECT pg_advisory_xact_lock(hashtext('gtmgrowth_forum_first_admin'))")
  owner = User.find_by_email(email)
  abort "Another administrator already exists." if User.real.where(admin: true).where.not(id: owner&.id).exists?
  abort "Refusing to claim an existing account." if owner && owner.email != email

  if owner&.active?
    abort "Existing account differs. Its credentials were preserved." unless
      owner.admin? && owner.user_password&.matches_password?(password)
  else
    abort "Refusing to replace an existing account." if owner && (!owner.admin? || owner.has_password?)
    owner ||= User.new(email: email, username: UserNameSuggester.suggest(email))
    owner.password = password
    owner.password_required!
    owner.active = true
    abort "Discourse rejected the password or account profile." unless owner.save
    owner.grant_admin!
    owner.change_trust_level!(1) if owner.trust_level < 1
    owner.activate
  end
  owner.reload
  abort "Local administrator verification failed." unless
    owner.active? && owner.admin? && owner.email_confirmed? && owner.user_password&.matches_password?(password)
end

SiteSetting.enable_local_logins = true unless SiteSetting.enable_local_logins?
SiteSetting.enable_discourse_id = false if SiteSetting.enable_discourse_id?
abort "First-login bootstrap is still active." if SiteSetting.has_login_hint?
puts "Verified an active local administrator and the supplied password."
