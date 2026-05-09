// ============================================================
// Gujarati Quote Telegram Bot — Express.js
// Deploy on Render.com (free tier)
// ============================================================

const express = require('express');
const cron = require('node-cron');
const app = express();
app.use(express.json());

// ============================================================
// ENV VARIABLES — set these in Render dashboard
// ============================================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const UNSPLASH_KEY = process.env.UNSPLASH_KEY;
const HCTI_USER_ID = process.env.HCTI_USER_ID;
const HCTI_API_KEY = process.env.HCTI_API_KEY;
const RENDER_URL = process.env.RENDER_URL; // e.g. https://your-app.onrender.com

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const TOTAL_QUOTES = 1500;

// ============================================================
// HELPER — Telegram API calls
// ============================================================

async function sendMessage(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra })
  });
}

async function sendPhoto(chatId, photoUrl, caption = '') {
  await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption })
  });
}

async function answerCallback(callbackQueryId) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

// ============================================================
// HELPER — Supabase calls
// ============================================================

const SUPA_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function supaGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SUPA_HEADERS });
  return res.json();
}

async function supaPost(path, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  });
}

async function supaPatch(path, body) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  });
}

async function getUser(chatId) {
  const rows = await supaGet(`users?chat_id=eq.${chatId}&select=name`);
  return rows.length > 0 ? rows[0] : null;
}

async function saveUser(chatId, name) {
  await supaPost('users', { chat_id: chatId, name, joined_at: new Date().toISOString() });
}

async function getQuoteIndex() {
  const rows = await supaGet('config?key=eq.quote_index&select=value');
  return parseInt(rows[0].value);
}

async function incrementQuoteIndex(current) {
  const next = (current + 1) >= TOTAL_QUOTES ? 0 : current + 1;
  await supaPatch('config?key=eq.quote_index', { value: String(next) });
  return next;
}

async function fetchQuoteAtIndex(index) {
  const rows = await supaGet(`quotes?select=id,quote,mood&order=id.asc&limit=1&offset=${index}`);
  return rows[0];
}

async function getAllUsers() {
  return supaGet('users?select=chat_id,name');
}

// ============================================================
// HELPER — Groq AI quote generation
// ============================================================

async function generateAIQuote(theme = null) {
  const prompt = theme
    ? `Generate one short Gujarati quote on the theme of "${theme}". Emotional and meaningful. 1-2 lines only. Output ONLY valid JSON (no markdown): {"quote": "<gujarati text>", "mood": "<one english word: sunrise/nature/spiritual/peace/mountain/minimal/sky>"}`
    : `Generate one short Gujarati motivational quote for WhatsApp status. Emotional and meaningful. 1-2 lines only. Output ONLY valid JSON (no markdown): {"quote": "<gujarati text>", "mood": "<one english word: sunrise/nature/spiritual/peace/mountain/minimal/sky>"}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await res.json();
  console.log('🤖 Groq response status:', res.status, 'body:', JSON.stringify(data).substring(0, 300));
  if (!data.choices || !data.choices[0]) {
    throw new Error('Groq API failed: ' + JSON.stringify(data));
  }
  const raw = data.choices[0].message.content.trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ============================================================
// HELPER — Unsplash background
// ============================================================

async function fetchBackground(mood) {
  const res = await fetch(
    `https://api.unsplash.com/photos/random?query=${mood}&orientation=portrait&client_id=${UNSPLASH_KEY}`
  );
  const data = await res.json();
  return data.urls.regular;
}

// ============================================================
// HELPER — Build HTML poster
// ============================================================

function buildPosterHTML(imageUrl, quote, name) {
  return `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;background:url('${imageUrl}') center/cover no-repeat;display:flex;align-items:flex-end;font-family:'Noto Sans Gujarati',sans-serif;">
  <div style="width:100%;padding:100px 70px 120px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.5) 60%,transparent 100%);">
    <div style="width:60px;height:4px;background:#fff;opacity:0.5;margin-bottom:40px;border-radius:2px;"></div>
    <p style="color:#ffffff;font-size:68px;line-height:1.55;margin:0 0 50px;font-weight:400;text-shadow:0 2px 20px rgba(0,0,0,0.4);">${quote}</p>
    <p style="color:rgba(255,255,255,0.6);font-size:40px;margin:0;font-weight:400;letter-spacing:0.03em;">— ${name}</p>
  </div>
</body>
</html>`;
}

// ============================================================
// HELPER — Render HTML to image via hcti.io
// ============================================================

async function renderPoster(html) {
  console.log("🖼️ Rendering poster via hcti.io, USER_ID:", HCTI_USER_ID ? "set" : "MISSING", "API_KEY:", HCTI_API_KEY ? "set" : "MISSING");
  const credentials = Buffer.from(`${HCTI_USER_ID}:${HCTI_API_KEY}`).toString("base64");
  const res = await fetch("https://hcti.io/v1/image", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ html, viewport_width: 1080, viewport_height: 1920 })
  });
  const data = await res.json();
  console.log("🖼️ hcti.io response:", JSON.stringify(data));
  // Convert API URL to direct image URL by appending .jpg
  const imageUrl = data.url + ".jpg";
  console.log("Final image URL:", imageUrl);
  return imageUrl;
}

// ============================================================
// HELPER — Full quote poster pipeline
// ============================================================

async function sendQuotePoster(chatId, quote, mood, userName, caption) {
  try {
    const imageUrl = await fetchBackground(mood);
    const html = buildPosterHTML(imageUrl, quote, userName);
    const posterUrl = await renderPoster(html);
    await sendPhoto(chatId, posterUrl, caption);
  } catch (err) {
    console.error('sendQuotePoster error:', err);
    await sendMessage(chatId, '⚠️ Quote generate કરવામાં error આવ્યો. ફરી try કરો.');
  }
}

// ============================================================
// MENU keyboard
// ============================================================

const MAIN_MENU = {
  reply_markup: JSON.stringify({
    keyboard: [
      [{ text: '/daily' }, { text: '/ai' }],
      [{ text: '/custom' }, { text: '/theme' }]
    ],
    resize_keyboard: true
  })
};

// Track users waiting to send a custom quote
const awaitingCustomQuote = new Set();

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleStart(chatId) {
  const user = await getUser(chatId);
  if (user) {
    await sendMessage(chatId,
      `ફરી સ્વાગત છે, ${user.name}! 🌸\n\nશું કરવું છે?\n/daily — આજનો quote\n/ai — નવો AI quote\n/custom — તમારો quote\n/theme — theme પ્રમાણે`,
      MAIN_MENU
    );
  } else {
    await sendMessage(chatId,
      `નમસ્તે! 🙏\n\nહું તમારા માટે દરરોજ સુંદર Gujarati quotes બનાવીશ.\n\nપહેલા મને તમારું નામ જણાવો — quote ની નીચે તમારું નામ લખવામાં આવશે. ✍️\n\nTumharu naam shu chhe?`
    );
  }
}

async function handleDaily(chatId) {
  const user = await getUser(chatId);
  if (!user) return sendMessage(chatId, 'પહેલા /start મોકલો અને તમારું નામ આપો.');

  await sendMessage(chatId, '⏳ Quote તૈયાર થઈ રહ્યો છે...');

  const index = await getQuoteIndex();
  const quoteData = await fetchQuoteAtIndex(index);
  await incrementQuoteIndex(index);

  await sendQuotePoster(
    chatId,
    quoteData.quote,
    quoteData.mood,
    user.name,
    '🌅 આજનો quote\n\nSave કરો, Share કરો 🙏'
  );
}

async function handleAI(chatId) {
  const user = await getUser(chatId);
  if (!user) return sendMessage(chatId, 'પહેલા /start મોકલો અને તમારું નામ આપો.');

  await sendMessage(chatId, '🤖 AI quote generate થઈ રહ્યો છે...');

  const { quote, mood } = await generateAIQuote();
  await sendQuotePoster(
    chatId,
    quote,
    mood,
    user.name,
    '✨ તાજો AI quote\n\nSave કરો, Share કરો 🙏'
  );
}

async function handleCustom(chatId) {
  const user = await getUser(chatId);
  if (!user) return sendMessage(chatId, 'પહેલા /start મોકલો અને તમારું નામ આપો.');

  awaitingCustomQuote.add(chatId);
  await sendMessage(chatId,
    '✍️ તમારો quote ટાઈપ કરો:\n\n(Gujarati અથવા English — બંને ચાલે)',
    { reply_markup: JSON.stringify({ force_reply: true }) }
  );
}

async function handleTheme(chatId) {
  await sendMessage(chatId, '🎨 કઈ theme જોઈએ છે?', {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: '🙏 Spiritual', callback_data: 'theme_spiritual' }, { text: '🌿 Nature', callback_data: 'theme_nature' }],
        [{ text: '💪 Motivation', callback_data: 'theme_motivation' }, { text: '❤️ Life', callback_data: 'theme_life' }],
        [{ text: '🎉 Festival', callback_data: 'theme_festival' }, { text: '📈 Business', callback_data: 'theme_business' }]
      ]
    })
  });
}

async function handleThemeCallback(chatId, callbackQueryId, callbackData) {
  await answerCallback(callbackQueryId);

  const theme = callbackData.replace('theme_', '');
  const user = await getUser(chatId);
  if (!user) return sendMessage(chatId, 'પહેલા /start મોકલો અને તમારું નામ આપો.');

  await sendMessage(chatId, `⏳ ${theme} quote તૈયાર થઈ રહ્યો છે...`);

  const { quote, mood } = await generateAIQuote(theme);
  await sendQuotePoster(
    chatId,
    quote,
    mood,
    user.name,
    `🎨 ${theme} theme નો quote\n\nSave કરો, Share કરો 🙏`
  );
}

async function handleFallback(chatId, text) {
  // If waiting for custom quote
  if (awaitingCustomQuote.has(chatId)) {
    awaitingCustomQuote.delete(chatId);
    const user = await getUser(chatId);
    if (!user) return sendMessage(chatId, 'પહેલા /start મોકલો.');

    await sendMessage(chatId, '⏳ તમારો quote poster બની રહ્યો છે...');
    await sendQuotePoster(
      chatId,
      text,
      'minimal',
      user.name,
      '✍️ તમારો quote\n\nSave કરો, Share કરો 🙏'
    );
    return;
  }

  // Otherwise treat as name input
  const user = await getUser(chatId);
  if (!user) {
    await saveUser(chatId, text.trim());
    await sendMessage(chatId,
      `સરસ! ${text.trim()} — સ્વાગત છે! 🎉\n\nહવે દરરોજ સવારે 6 વાગ્યે તમને quote મળશે.\n\nશું કરવું છે?\n/daily — આજનો quote\n/ai — નવો AI quote\n/custom — તમારો quote\n/theme — theme પ્રમાણે`,
      MAIN_MENU
    );
  } else {
    await sendMessage(chatId,
      'આ command સમજાઈ નહિ. નીચેથી option select કરો:',
      MAIN_MENU
    );
  }
}

// ============================================================
// WEBHOOK ENDPOINT — Telegram sends all updates here
// ============================================================

app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond fast to Telegram

  try {
    const body = req.body;
    console.log('📩 Incoming update:', JSON.stringify(body).substring(0, 200));

    const message = body.message;
    const callbackQuery = body.callback_query;

    // Handle callback queries (theme button taps)
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id;
      console.log(`🎨 Callback: ${callbackQuery.data} from ${chatId}`);
      await handleThemeCallback(chatId, callbackQuery.id, callbackQuery.data);
      return;
    }

    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text.trim();
    console.log(`💬 Command: "${text}" from ${chatId}`);

    if (text === '/start') return handleStart(chatId);
    if (text === '/daily') return handleDaily(chatId);
    if (text === '/ai') return handleAI(chatId);
    if (text === '/custom') return handleCustom(chatId);
    if (text === '/theme') return handleTheme(chatId);
    return handleFallback(chatId, text);

  } catch (err) {
    console.error('❌ Webhook error:', err);
  }
});

// ============================================================
// HEALTH CHECK — UptimeRobot pings this to keep app awake
// ============================================================

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ============================================================
// DAILY 6AM BROADCAST — Cron job (IST = UTC+5:30, so 00:30 UTC)
// ============================================================

cron.schedule('30 0 * * *', async () => {
  console.log('🌅 Starting 6AM broadcast...');
  try {
    const index = await getQuoteIndex();
    const quoteData = await fetchQuoteAtIndex(index);
    await incrementQuoteIndex(index);

    const imageUrl = await fetchBackground(quoteData.mood);
    const users = await getAllUsers();

    console.log(`Broadcasting to ${users.length} users...`);

    for (const user of users) {
      try {
        const html = buildPosterHTML(imageUrl, quoteData.quote, user.name);
        const posterUrl = await renderPoster(html);
        await sendPhoto(user.chat_id, posterUrl, '🌅 આજનો સવારનો quote\n\nSave કરો, Share કરો 🙏');
        console.log(`✅ Sent to ${user.name} (${user.chat_id})`);
        // Wait 1 second between users to avoid Telegram rate limits
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`❌ Failed for user ${user.chat_id}:`, err.message);
      }
    }

    console.log('✅ Broadcast complete');
  } catch (err) {
    console.error('❌ Broadcast error:', err);
  }
}, { timezone: 'UTC' });

// ============================================================
// REGISTER WEBHOOK with Telegram on startup
// ============================================================

async function registerWebhook() {
  if (!RENDER_URL) return console.log('⚠️ RENDER_URL not set — skipping webhook registration');
  const webhookUrl = `${RENDER_URL}/webhook`;
  const res = await fetch(`${TELEGRAM_API}/setWebhook?url=${webhookUrl}`);
  const data = await res.json();
  console.log('Webhook registered:', data);
}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Bot server running on port ${PORT}`);
  await registerWebhook();
});
