const pool = require('../config/db');

const APP_NAME = process.env.APP_NAME || 'Groo Max';

// Indian mobile ko +91XXXXXXXXXX format me badalta hai. Samajh na aaye to null.
const toE164 = (mobile) => {
  const d = String(mobile || '').replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `+91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  return null;
};

// Twilio ki Messages API (SMS aur WhatsApp dono isi se jate hain)
async function twilioSend({ to, from, text }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) return 'skipped: Twilio ki keys .env me nahi hain';

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
    signal: AbortSignal.timeout(8000) // message atak jaye to owner ka Accept na ruke
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twilio ${res.status}: ${body.slice(0, 200)}`);
  }
  return 'sent';
}

// SMS. Provider .env se tay hota hai:
//   SMS_PROVIDER=none (default) -> SMS nahi jata, baaki sab kaam karta hai
//   SMS_PROVIDER=twilio         -> TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM chahiye
// Wapas text deta hai: 'sent' ya 'skipped: ...'. Error aaye to throw karta hai.
async function sendSms(mobile, text) {
  const provider = (process.env.SMS_PROVIDER || 'none').toLowerCase();
  if (provider === 'none') return 'skipped: SMS_PROVIDER none hai';

  const to = toE164(mobile);
  if (!to) return 'skipped: mobile number valid nahi';

  if (provider === 'twilio') return twilioSend({ to, from: process.env.TWILIO_FROM, text });
  return `skipped: provider "${provider}" support nahi hai`;
}

// WhatsApp. Provider .env se:
//   WHATSAPP_PROVIDER=none (default) -> nahi jata
//   WHATSAPP_PROVIDER=twilio         -> TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
//                                       (testing ke liye Twilio ka sandbox number: whatsapp:+14155238886)
// Dhyan: sandbox me customer ko pehle sandbox number par "join <code>" bhejna padta hai. Asli customers ko
// apne aap message bhejne ke liye Meta se approved business number aur message template chahiye.
async function sendWhatsapp(mobile, text) {
  const provider = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
  if (provider === 'none') return 'skipped: WHATSAPP_PROVIDER none hai';

  const to = toE164(mobile);
  if (!to) return 'skipped: mobile number valid nahi';

  if (provider === 'twilio') {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!from) return 'skipped: TWILIO_WHATSAPP_FROM .env me nahi hai';
    return twilioSend({ to: `whatsapp:${to}`, from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`, text });
  }
  return `skipped: provider "${provider}" support nahi hai`;
}

// User ko app me notification (notifications table) aur, agar chalu ho, SMS / WhatsApp.
// Koi bhi fail ho to booking ka kaam nahi rukta. Result wapas milta hai (text bhi, taaki owner wa.me link bana sake).
async function notifyUser({ userId, title, message, sms = true, whatsapp = true }) {
  const text = `${APP_NAME}: ${message}`;
  const result = { inApp: false, sms: 'skipped', whatsapp: 'skipped', text };

  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
      [userId, title, message]
    );
    result.inApp = true;
  } catch (err) {
    console.error('Notification insert failed:', err.message);
  }

  if (!sms && !whatsapp) return result;

  let mobile = null;
  try {
    const u = await pool.query('SELECT mobile FROM users WHERE id = $1', [userId]);
    mobile = u.rows.length ? u.rows[0].mobile : null;
  } catch (err) {
    console.error('Mobile lookup failed:', err.message);
  }

  if (sms) {
    try {
      result.sms = mobile === null ? 'skipped: customer nahi mila' : await sendSms(mobile, text);
    } catch (err) {
      console.error('SMS failed:', err.message);
      result.sms = 'failed';
    }
  }
  if (whatsapp) {
    try {
      result.whatsapp = mobile === null ? 'skipped: customer nahi mila' : await sendWhatsapp(mobile, text);
    } catch (err) {
      console.error('WhatsApp failed:', err.message);
      result.whatsapp = 'failed';
    }
  }
  return result;
}

module.exports = { notifyUser, notifyCustomer: notifyUser, sendSms, sendWhatsapp, toE164 };
