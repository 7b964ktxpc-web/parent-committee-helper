const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || '';
const YANDEX_IAM_TOKEN = process.env.YANDEX_IAM_TOKEN || '';
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || '';
const YANDEX_MODEL_URI = process.env.YANDEX_MODEL_URI || (YANDEX_FOLDER_ID ? `gpt://${YANDEX_FOLDER_ID}/aliceai-llm` : '');
const YANDEX_FLASH_MODEL_URI = process.env.YANDEX_FLASH_MODEL_URI || (YANDEX_FOLDER_ID ? `gpt://${YANDEX_FOLDER_ID}/aliceai-llm-flash` : '');
const YANDEX_API_HOST = 'llm.api.cloud.yandex.net';
const YANDEX_API_PATH = '/foundationModels/v1/completion';

function buildSystemPrompt(profile) {
  const name = profile?.userName || 'друг';
  const assistantName = profile?.assistantName || 'Помощник';
  const group = profile?.groupName || 'не указана';
  const kindergarten = profile?.kindergarten || 'не указан';
  const role = profile?.role || 'Родитель';
  const style = (profile?.style && profile.style.length) ? profile.style.join(', ') : 'простой, живой, уверенный, доброжелательный';
  const context = profile?.extraContext || '';
  return `Ты — ${assistantName}, личный помощник ${name} по родительскому комитету группы «${group}» детского сада «${kindergarten}».

Помогай писать и редактировать сообщения в чат, отвечать на возражения, спокойно разруливать спорные ситуации, готовить сборы денег, объяснять расходы, организовывать мероприятия, списки и напоминания.

Пиши как живой человек. Не начинай с «Конечно!», «С удовольствием!», «Отличная идея!» и подобных фраз. Если нужен текст для родительского чата — сразу давай готовый текст. Стиль пользователя: ${style}. Если пользователь пишет коротко — отвечай коротко. Не раздувай ответ. По умолчанию один лучший вариант. Не меняй смысл черновика. В конфликте не переходи на личности и не используй канцелярит. Для сбора денег говори спокойно и уверенно, без давления. Если денег ранее не хватило, говори именно о доборе суммы. Отвечай на русском.

ПОСТОЯННЫЙ КОНТЕКСТ:
${context || 'Контекст пока не задан.'}`;
}

function requestYandex(modelUri, messages) {
  return new Promise((resolve, reject) => {
    const auth = YANDEX_IAM_TOKEN ? `Bearer ${YANDEX_IAM_TOKEN}` : (YANDEX_API_KEY ? `Api-Key ${YANDEX_API_KEY}` : '');
    if (!auth || !modelUri) return reject(new Error('Yandex AI is not configured'));
    const payload = JSON.stringify({ modelUri, completionOptions: { stream: false, temperature: 0.65, maxTokens: '1200' }, messages });
    const reqApi = https.request({ hostname: YANDEX_API_HOST, port: 443, path: YANDEX_API_PATH, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': auth, 'Content-Length': Buffer.byteLength(payload) } }, resp => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (resp.statusCode < 200 || resp.statusCode >= 300 || parsed.error) return reject(new Error(parsed.message || parsed.error || `Yandex HTTP ${resp.statusCode}`));
          resolve({ text: parsed?.result?.alternatives?.[0]?.message?.text || '', usage: parsed?.result?.usage || null });
        } catch (e) { reject(e); }
      });
    });
    reqApi.on('error', reject);
    reqApi.write(payload);
    reqApi.end();
  });
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, profile } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Нет сообщений' });
    const clean = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-24);
    const text = clean.map(m => m.content).join(' ');
    const complex = text.length > 7000 || /проанализ|разберись|подробно|сравни|спланируй|документ|конфликт|несоглас/i.test(text);
    const model = !complex && YANDEX_FLASH_MODEL_URI ? YANDEX_FLASH_MODEL_URI : YANDEX_MODEL_URI;
    const result = await requestYandex(model, [{ role: 'system', text: buildSystemPrompt(profile || {}) }, ...clean.map(m => ({ role: m.role, text: m.content }))]);
    if (!result.text.trim()) throw new Error('Empty model response');
    return res.json({ reply: result.text.trim(), model: model.includes('flash') ? 'flash' : 'llm', usage: result.usage });
  } catch (e) {
    console.error(e);
    const last = [...(req.body?.messages || [])].reverse().find(m => m.role === 'user');
    if (!YANDEX_API_KEY && !YANDEX_IAM_TOKEN) return res.json({ reply: heuristicReply(last?.content || ''), model: 'demo' });
    return res.status(502).json({ error: 'Не удалось получить ответ от Alice AI' });
  }
});

function heuristicReply(text) {
  const t = (text || '').trim();
  if (!t) return 'Напиши, что нужно сделать — помогу сформулировать.';
  if (/сбор|деньг|подарк|экскурс/i.test(t)) return 'Ребят, по этому вопросу давайте закроем всё спокойно. Кто ещё не перевёл свою часть — добавьте, пожалуйста, чтобы мы смогли всё организовать.';
  if (/ответ|возраж|почему/i.test(t)) return 'Я бы ответил спокойно: «Понимаю вопрос. Давайте посмотрим по ситуации и решим, как будет удобнее всем, без лишних споров».';
  if (/голосован/i.test(t)) return 'Предлагаю так: кто за — ставьте 👍, кто против — напишите коротко почему. Вечером подведём итог и решим дальше.';
  return 'Понял. Напиши, что именно нужно сказать или сделать — помогу сформулировать по-человечески.';
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.listen(PORT, () => console.log(`Parent Committee Helper started on port ${PORT}`));
} else {
  module.exports = app;
}
