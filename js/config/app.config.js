export const ORG_ID = 'musicala';
export const DEFAULT_PLAN_ID = '2026';

export const APP_CONFIG = {
  appName: 'Plan Financiero 2026',
  orgName: 'Musicala',
  currency: 'COP',
  locale: 'es-CO',
  allowedEmails: [
    'alekcaballeromusic@gmail.com',
    'catalina.medina.leal@gmail.com',
  ],
};

export function isAllowedEmail(email) {
  return APP_CONFIG.allowedEmails.includes(String(email || '').toLowerCase());
}

export function planPath(planId = DEFAULT_PLAN_ID) {
  return `organizations/${ORG_ID}/financialPlans/${planId}`;
}
