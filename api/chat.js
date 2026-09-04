const https = require('https');

const API_KEY = process.env.YANDEX_API_KEY || '';
const FOLDER_ID = process.env.YANDEX_FOLDER_ID || '';
const BASE_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';

function buildSystemPrompt(profile) {
  const name = profile?.userName || 'пользователь';
  const assistantName = profile?.assistantName || 'Помощник';
  const group = profile?.groupName || 'не указана';
  const kindergarten = profile?.kindergarten || 'не указан';
  const role = profile?.role || 'Родитель';
  const style = profile?.style?.length ? profile.style.join(', ') : 'простой, живой, уверенный, доброжелательный';
  const context = profile?.extraContext || 'Контекст пока не задан.';

  return `Ты — ${assistantName}, личный помощник ${name} по делам родительского комитета.
${name} — ${role} в группе «${group}» детского сада «${kindergarten}».

Твоя задача — экономить человеку время. Помогай писать сообщения родителям, отвечать на резкие сообщения, организовывать сборы денег и мероприятия, делать голосования и списки, а также разбирать спорные ситуации.

ГЛАВНОЕ ПРАВИЛО: пиши как нормальный человек из родительского чата. Не звучишь как корпоративный бот или консультант. Не начинай с «Конечно!», «С удовольствием!», «Давайте разберёмся!» и подобных шаблонов. Не используй канцелярит, длинные вступления и лишние пояснения.

Стиль пользователя: ${style}.
Если просят текст для чата — сразу дай готовый текст, который можно скопировать и отправить.
По умолчанию давай один лучший вариант. Второй вариант предлагай только если он реально отличается по тону.
Сохраняй смысл и важные детали пользователя. Не выдумывай суммы, даты, имена, реквизиты, решения группы или факты.
Если данных не хватает, сначала сделай разумный вариант с нейтральным местом для уточнения вроде [сумма] или [дата]. Задавай вопрос только если без него невозможно выполнить задачу.
В конфликте не читай лекцию по психологии. Сначала дай конкретную спокойную формулировку ответа.
Для сбора денег не дави на родителей и не стыди тех, кто ещё не перевёл. Для голосований формулируй варианты максимально однозначно.

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
        } catch {
          reject(new Error('Некорректный ответ Yandex AI Studio'));
        }
      });
    });
    req.setTimeout(25000, () => req.destroy(new Error('Таймаут запроса к AI')));
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

    const userMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-20)
      .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 6000) }));
    const lastUser = [...userMessages].reverse().find(m => m.role === 'user')?.content || '';
    const model = modelFor(lastUser, userMessages);
    const responseMessages = [
      { role: 'system', content: buildSystemPrompt(profile || {}) },
      ...userMessages
    ];

    let reply;
    try {
      reply = await requestYandex({ model, messages: responseMessages, temperature: 0.7, max_tokens: 900 });
    } catch (firstError) {
      if (model.endsWith('/aliceai-llm-flash')) {
        const fallbackModel = `gpt://${FOLDER_ID}/aliceai-llm`;
        reply = await requestYandex({ model: fallbackModel, messages: responseMessages, temperature: 0.7, max_tokens: 900 });
        return res.json({ reply: reply.trim(), model: 'aliceai-llm' });
      }
      throw firstError;
    }

    return res.json({ reply: reply.trim(), model: model.split('/').pop() });
  } catch (error) {
    console.error('Alice AI error:', error?.message || error);
    return res.status(502).json({ error: 'AI_UNAVAILABLE' });
  }
};
