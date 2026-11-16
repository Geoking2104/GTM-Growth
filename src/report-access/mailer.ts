/** Strict TLS SMTP sender for the one-time report code (no third-party tracker). */
import nodemailer from "nodemailer";
import { isIP } from "node:net";
import type { ReportInvitation, MailSender } from "./service.js";

export interface SmtpSettings { host: string; port: number; user: string; password: string; from: string; publicOrigin: string }

export function smtpSettings(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const { REPORT_SMTP_HOST: host, REPORT_SMTP_USER: user, REPORT_SMTP_PASSWORD: password, REPORT_SMTP_FROM: from } = env;
  const port = Number(env.REPORT_SMTP_PORT || "587");
  if (!host || !user || !password || !from || !Number.isSafeInteger(port) || port < 1 || port > 65535) return null;
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes(".") || isIP(host) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return null;
  const origin = env.REPORT_PUBLIC_ORIGIN || "https://gtm.kayroslab.com";
  let publicOrigin: string;
  try { const parsed = new URL(origin); if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null; publicOrigin = parsed.origin; }
  catch { return null; }
  return { host, port, user, password, from, publicOrigin };
}

export function createSmtpSender(settings: SmtpSettings): MailSender {
  const transport = nodemailer.createTransport({
    host: settings.host, port: settings.port, secure: settings.port === 465,
    requireTLS: settings.port !== 465, auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 10_000, greetingTimeout: 8_000, socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  return async (invite: ReportInvitation): Promise<void> => {
    const link = new URL(`/report/?id=${encodeURIComponent(invite.id)}&lang=${invite.language}`, settings.publicOrigin).href;
    const fr = invite.language === "fr";
    const subject = fr ? "GTM Growth - votre code d'accès au rapport" : "GTM Growth - your report access code";
    const message = fr
      ? `Votre rapport gratuit GTM Growth est prêt.\n\nCode : ${invite.code}\nCe code expire dans 15 minutes et ne peut être utilisé qu'une fois.\n\n1. Retournez sur ${link}\n2. Saisissez l'adresse e-mail destinataire et ce code.\n3. Consultez le rapport HTML et téléchargez le PDF ou Markdown.\n\nSi vous n'avez pas demandé ce rapport, ignorez cet e-mail. Aucun compte n'a été créé.`
      : `Your GTM Growth free report is ready.\n\nCode: ${invite.code}\nThis code expires in 15 minutes and works only once.\n\n1. Return to ${link}\n2. Enter the receiving email address and this code.\n3. View the HTML report and download PDF or Markdown.\n\nIf you did not request this report, ignore this email. No account was created.`;
    await transport.sendMail({ from: settings.from, to: invite.email, subject, text: message,
      headers: { "X-Auto-Response-Suppress": "All" } });
  };
}
