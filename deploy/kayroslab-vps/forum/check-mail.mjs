// Runs inside the GTM application. Only readiness classifications leave it.
import nodemailer from 'nodemailer';
import { smtpSettings } from './dist/report-access/mailer.js';
import { KeycloakAdmin, keycloakAdminFromEnv } from './dist/tenants/keycloak-admin.js';

function kayroslabSender(from) {
  return /^[^\s<>@]+@(?:[a-z0-9-]+\.)*kayroslab\.com$/i.test(from || '');
}

const settings = smtpSettings();
if (!settings) {
  console.log('GTM report SMTP: not configured or incomplete.');
} else if (!kayroslabSender(settings.from)) {
  console.log('GTM report SMTP: sender outside KayrosLab.');
} else {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  try {
    await transport.verify();
    console.log('GTM report SMTP: KayrosLab sender configured and verified TLS authentication succeeded.');
  } catch {
    console.log('GTM report SMTP: KayrosLab sender configured but TLS authentication could not be verified.');
  } finally {
    transport.close();
  }
}

// The production realm can use a separate relay for GTM account invitations.
const config = keycloakAdminFromEnv();
try {
  if (!config) throw new Error();
  const client = new KeycloakAdmin({
    ...config,
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
  });
  const realm = await client.call('GET', '/gtm-growth');
  const mail = realm.data?.smtpServer;
  if (!mail?.host || !mail.from) {
    console.log('GTM identity SMTP: not configured or incomplete.');
  } else if (!kayroslabSender(mail.from)) {
    console.log('GTM identity SMTP: sender outside KayrosLab.');
  } else {
    const host = String(mail.host).trim();
    if (!/^[a-z0-9.:_-]{1,253}$/i.test(host)) throw new Error();
    const secure = mail.ssl === 'true';
    const starttls = mail.starttls === 'true';
    const auth = mail.auth === 'true';
    const port = Number(mail.port || (secure ? 465 : 25));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    console.log(`GTM identity SMTP: KayrosLab sender on ${host}:${port}; implicit TLS=${secure}, STARTTLS=${starttls}, authentication=${auth}.`);
    if (auth) {
      console.log('GTM identity SMTP: provision a forum credential for this authenticated relay.');
    } else {
      const relay = nodemailer.createTransport({
        host, port, secure, requireTLS: starttls,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
      });
      try {
        await relay.verify();
        console.log('GTM identity SMTP: relay handshake succeeded from GTM Growth.');
      } catch {
        console.log('GTM identity SMTP: relay handshake failed from GTM Growth.');
      } finally {
        relay.close();
      }
    }
  }
} catch {
  console.log('GTM identity SMTP: configuration could not be verified.');
}
