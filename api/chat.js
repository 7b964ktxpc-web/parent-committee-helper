const https = require('https');

const API_KEY = process.env.YANDEX_API_KEY || '';
const FOLDER_ID = process.env.YANDEX_FOLDER_ID || '';
const BASE_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';

function buildSystemPrompt(profile) {
  const name = profile?.userName || 'друг';
  const assistantName = profile?.assistantName || 'Помощник';
  const group = profile?.groupName || 'не указана';
  const kindergarten = profile?.kindergarten || 'не указан';
  const role = profile?.role || 'Родитель';
  const style = profile?.style?.length ? profile.style.join(', ') : 'простой, живой, уверенный, доброжелательный';
  const context = profile?.extraContext || 'Контекст пока не задан.';

  return `Ты — ${assistantName}, личный помощник ${name} по делам родительского комитета.
${name} — ${role} в группе «${group}» детского сада «${kindergarten}».

Помогай писать и редактировать сообщения родителям, отвечать на возражения, спокойно решать конфликты, организовывать сборы денег, мероприятия, голосования и списки.

Главное: говори как обычный живой человек, а не как ИИ. Не начинай ответы с «Конечно!», «С удовольствием!», «Давайте разберёмся!» и подобных фраз. Не пиши канцеляритом и не раздувай ответ.
Стиль ${name}: ${style}.
Если нужен текст для родительского чата — сразу дай готовый текст, без пояснений вокруг него.
По умолчанию давай один лучший вариант. Если действительно полезно — можно дать мягкий и более уверенный вариант.
Сохраняй смысл черновика пользователя и не исправляй его манеру без необходимости.
В конфликте не занимайся психологической лекцией: предложи спокойную, человеческую формулировку.
Если информации не хватает, задай максимум один короткий вопрос, но сначала попробуй сделать разумное предположение.

Контекст группы:
${context}

Отвечай на русском.`;
}

function isComplex(text, messages) {
  const t = String(text || '').toLowerCase();
  const complexWords = /конфликт|спор|возраж|почему|объясни|разбер|проанализ|сравни|документ|несколько|вариант|сложн|ситуац|решение|аргумент|перепис|истори|подробн/;
  return t.length > 700 || complexWords.test(t) || messages.length > 8;
}

function modelFor(text, messages) {
  return `gpt://${FOLDER_ID}/${isComplex(text, messages) ? 'aliceai-llm' : 'aliceai-llm-flash'}`;
}

function requestYandex(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, resp => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (resp.statusCode < 200 || resp.statusCode >= 300) {
            return reject(new Error(parsed?.error?.message || parsed?.message || `Yandex API ${resp.statusCode}`));
          }
          const text = parsed?.choices?.[0]?.message?.content || '';
          if (!text) return reject(new Error('Пустой ответ модели'));
          resolve(text);
        } catch (e) {
          reject(new Error('Некорректный ответ Yandex AI Studio'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  try {
    const { messages, profile } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Нет сообщений' });
    }

    if (!API_KEY || !FOLDER_ID) {
      return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
    }

    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20);
    const lastUser = [...userMessages].reverse().find(m => m.role === 'user')?.content || '';
    const model = modelFor(lastUser, userMessages);

    const responseMessages = [
      { role: 'system', content: buildSystemPrompt(profile || {}) },
      ...userMessages.map(m => ({ role: m.role, content: String(m.content || '') }))
    ];

    let reply;
    try {
      reply = await requestYandex({
        model,
        messages: responseMessages,
        temperature: 0.7,
        max_tokens: 900
      });
    } catch (firstError) {
      // Если Flash временно недоступна, автоматически пробуем флагманскую модель.
      if (model.endsWith('/aliceai-llm-flash')) {
        const fallbackModel = `gpt://${FOLDER_ID}/aliceai-llm`;
        reply = await requestYandex({
          model: fallbackModel,
          messages: responseMessages,
          temperature: 0.7,
          max_tokens: 900
        });
        return res.json({ reply, model: fallbackModel.split('/').pop() });
      }
      throw firstError;
    }

    return res.json({ reply, model: model.split('/').pop() });
  } catch (error) {
    console.error('Alice AI error:', error?.message || error);
    return res.status(502).json({ error: 'AI_UNAVAILABLE' });
  }
};
