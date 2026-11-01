/**
 * Copy for the free read, per language.
 *
 * Static page copy lives in each HTML file; this module only holds the strings
 * the browser generates after a visitor submits a URL, plus the verdict bands.
 */

export const translations = {
  en: {
    htmlLang: "en",
    checks: {
      "url.https": {
        label: "Served over HTTPS",
        evidence: (v) => v.protocol,
        fix: "Serve the site over HTTPS — plain HTTP is downgraded and distrusted.",
      },
      "url.host": {
        label: "Hostname is well formed",
        evidence: (v) => v.host,
        fix: "Use a normal domain: no underscores, not an IP address.",
      },
      "url.case": {
        label: "Path is lowercase",
        evidence: (v) => v.path,
        fix: "Keep paths lowercase; mixed case creates duplicate variants of the same page.",
      },
      "url.depth": {
        label: "Path depth is 3 or less",
        evidence: (v) => `${v.depth} segment(s)`,
        fix: "Flatten deep paths — short URLs survive copy/paste and stay stable.",
      },
      "url.params": {
        label: "No tracking parameters",
        evidence: (v) => v.search || "none",
        fix: "Strip utm_/gclid parameters from canonical URLs; they split citations across variants.",
      },
      "url.fragment": {
        label: "No fragment in the shared URL",
        evidence: (v) => v.hash || "none",
        fix: "Drop #fragments — they never reach the server and are not part of the addressable page.",
      },
      "url.length": {
        label: "URL is under 100 characters",
        evidence: (v) => `${v.length} characters`,
        fix: "Shorten the URL; long addresses get truncated in answers and chat previews.",
      },
      "url.ip": {
        label: "Uses a domain, not an IP",
        evidence: (v) => v.host,
        fix: "Point a domain at the host; IP addresses are not citable entities.",
      },
      "url.file": {
        label: "No file extension in the path",
        evidence: (v) => v.path,
        fix: "Prefer extensionless routes (/pricing, not /pricing.php).",
      },
      "url.slashes": {
        label: "No duplicated slashes",
        evidence: (v) => v.path,
        fix: "Normalise duplicate slashes; they create near-duplicate URLs.",
      },
    },
    verdicts: {
      clean: "Clean address — nothing in the URL is fighting you.",
      usable: "Usable address with a few fixable habits.",
      costly: "Several URL patterns will cost you citations.",
      poor: "The URL itself is working against the page.",
    },
    summary: (passed, total) => `${passed}/${total} checks pass.`,
    errors: {
      empty: "Enter a website URL to run the free read.",
      invalid: "That does not look like a URL. Try example.com or https://example.com.",
      protocol: "Only http(s) URLs are supported.",
      host: "That host is incomplete. Try a domain such as example.com.",
      spaces: "Hostnames cannot contain spaces.",
    },
    scoreLabel: (score) => `URL hygiene score: ${score} out of 100`,
    lead: {
      sending: "Sending…",
      mailto: "Your email client should open with the details filled in. If it does not, send the same information to the address in the footer.",
      sent: "Request sent. We reply with the audit and the three fixes that move the score most.",
      failed: (message) => `Could not send the request (${message}). You can still email us directly.`,
    },
  },

  fr: {
    htmlLang: "fr",
    checks: {
      "url.https": {
        label: "Servi en HTTPS",
        evidence: (v) => v.protocol,
        fix: "Servez le site en HTTPS — le HTTP simple est rétrogradé et peu fiable.",
      },
      "url.host": {
        label: "Nom d’hôte valide",
        evidence: (v) => v.host,
        fix: "Utilisez un domaine normal : pas de tiret bas, pas d’adresse IP.",
      },
      "url.case": {
        label: "Chemin en minuscules",
        evidence: (v) => v.path,
        fix: "Gardez les chemins en minuscules ; les majuscules créent des variantes dupliquées.",
      },
      "url.depth": {
        label: "Profondeur de chemin ≤ 3",
        evidence: (v) => `${v.depth} segment(s)`,
        fix: "Aplatissez les chemins profonds — les URL courtes survivent au copier-coller.",
      },
      "url.params": {
        label: "Aucun paramètre de suivi",
        evidence: (v) => v.search || "aucun",
        fix: "Retirez les paramètres utm_/gclid des URL canoniques ; ils dispersent les citations.",
      },
      "url.fragment": {
        label: "Aucun fragment dans l’URL partagée",
        evidence: (v) => v.hash || "aucun",
        fix: "Supprimez les #fragments — ils n’atteignent jamais le serveur.",
      },
      "url.length": {
        label: "URL de moins de 100 caractères",
        evidence: (v) => `${v.length} caractères`,
        fix: "Raccourcissez l’URL ; les adresses longues sont tronquées dans les réponses.",
      },
      "url.ip": {
        label: "Domaine plutôt qu’une IP",
        evidence: (v) => v.host,
        fix: "Pointez un domaine vers l’hôte ; une IP n’est pas une entité citable.",
      },
      "url.file": {
        label: "Aucune extension de fichier",
        evidence: (v) => v.path,
        fix: "Préférez des routes sans extension (/tarifs plutôt que /tarifs.php).",
      },
      "url.slashes": {
        label: "Aucune double barre oblique",
        evidence: (v) => v.path,
        fix: "Normalisez les doubles barres ; elles créent des URL quasi identiques.",
      },
    },
    verdicts: {
      clean: "Adresse propre — rien dans l’URL ne vous pénalise.",
      usable: "Adresse utilisable, avec quelques habitudes à corriger.",
      costly: "Plusieurs motifs d’URL vont vous coûter des citations.",
      poor: "L’URL elle-même dessert la page.",
    },
    summary: (passed, total) => `${passed}/${total} contrôles réussis.`,
    errors: {
      empty: "Saisissez l’URL d’un site pour lancer la lecture gratuite.",
      invalid: "Cela ne ressemble pas à une URL. Essayez example.com ou https://example.com.",
      protocol: "Seules les URL http(s) sont prises en charge.",
      host: "Cet hôte est incomplet. Essayez un domaine comme example.com.",
      spaces: "Un nom d’hôte ne peut pas contenir d’espace.",
    },
    scoreLabel: (score) => `Score d’hygiène de l’URL : ${score} sur 100`,
    lead: {
      sending: "Envoi…",
      mailto: "Votre client mail devrait s’ouvrir avec les informations préremplies. Sinon, écrivez-nous à l’adresse indiquée en bas de page.",
      sent: "Demande envoyée. Nous revenons vers vous avec l’audit et les trois correctifs les plus rentables.",
      failed: (message) => `Envoi impossible (${message}). Vous pouvez toujours nous écrire directement.`,
    },
  },
};

/** Pick a dictionary by `<html lang>`, falling back to English. */
export function dictFor(lang) {
  const key = String(lang || "en").slice(0, 2).toLowerCase();
  return translations[key] ?? translations.en;
}
