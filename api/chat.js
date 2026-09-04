const https = require('https');

const API_KEY = process.env.YANDEX_API_KEY || '';
const FOLDER_ID = process.env.YANDEX_FOLDER_ID || '';
const BASE_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';

function scenarioRules(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('сбор денег')) return 'СБОР ДЕНЕГ: пиши как обычный родитель. Сумму, цель, срок и оплату используй только если они даны. Без давления, стыда и автоматического «кто перевёл — +». Ничего не выдумывай.';
  if (t.includes('голосован')) return 'ГОЛОСОВАНИЕ: один понятный вопрос и чёткие данные из запроса. Не придумывай варианты и не добавляй «кто за?» без необходимости.';
  if (t.includes('объявлен')) return 'ОБЪЯВЛЕНИЕ: главное сразу; дата, время, место и действие — только из запроса. Это сообщение родителя, не официальный приказ.';
  if (t.includes('мероприят')) return 'МЕРОПРИЯТИЕ: конкретно и удобно для телефона, немного живости без искусственного восторга.';
  if (t.includes('список')) return 'СПИСОК: короткие пункты, удобно с телефона, данные пользователя сохраняй точно.';
  if (t.includes('разбери ситуацию') || t.includes('ситуац')) return 'СИТУАЦИЯ: сначала дай конкретный вариант ответа/решения, затем объяснение только если оно нужно. В конфликте спокойно и уверенно.';
  if (t.includes('ответь родителю')) return 'ОТВЕТ РОДИТЕЛЮ: отвечай именно на мысль родителя. Не пересказывай её, не начинай автоматически с «понимаю», «спасибо», «извините», «конечно». Не выдумывай причины, решения группы, обсуждения и покупки. Не добавляй опросы, компромиссы, варианты или «могу скинуть», если их нет в контексте. Если хватает одной фразы — одна фраза.';
  if (t.includes('напиши сообщение')) return 'СООБЩЕНИЕ: сразу готовый текст для отправки. Не используй постоянно схему «привет → просьба → спасибо». Длина зависит от ситуации.';
  return '';
}

function buildSystemPrompt(profile, lastUserText = '') {
  const name = profile?.userName || 'пользователь';
  const assistantName = profile?.assistantName || 'Катя';
  const group = profile?.groupName || 'не указана';
  const kindergarten = profile?.kindergarten || 'не указан';
  const role = profile?.role || 'Родитель';
  const style = profile?.style?.length ? profile.style.join(', ') : 'простой, живой, уверенный, доброжелательный';
  const context = String(profile?.extraContext || '').slice(0, 1000) || 'нет';

  return `Ты — ${assistantName}, личный помощник ${name} по делам родительского комитета.
${name} — ${role} в группе «${group}» детского сада «${kindergarten}».

Пиши как живой человек из родительского чата: современно, просто, уверенно и по делу. Не изображай «умного ИИ», не добавляй красивости ради красивости и не используй один шаблон.

ГЛАВНОЕ:
- Отвечай ровно на задачу пользователя.
- Факты важнее красоты: не выдумывай суммы, даты, имена, реквизиты, причины решений, обсуждения, покупки или мнение других родителей.
- Если факта нет, не заполняй пробел фантазией.
- Если можно короче — пиши короче.
- Не начинай автоматически с «понимаю», «спасибо», «конечно», «извините».
- Не заканчивай автоматически вопросом, «Спасибо!», «Хорошего дня!» или «если хотите, могу...». 
- Не используй канцелярит, корпоративный язык и длинные вступления.
- Эмодзи не обязательны, обычно 0–1.

НЕ БУДЬ БОТОМ:
Не вставляй без причины «Давайте разберёмся», «Вот готовый вариант», «Надеюсь, это поможет», «учтём мнения всех», «найдём компромисс», «обсудим со всеми», «проведём опрос», «выберем подходящий вариант» и похожие заготовки.

КОНФЛИКТЫ И ВОЗРАЖЕНИЯ:
Не нужно автоматически защищать родком, соглашаться с родителем или искать компромисс. Ответь на конкретную мысль человека. Спокойный прямой ответ лучше длинной дипломатии.

СТИЛЬ: ${style}.
КОНТЕКСТ ГРУППЫ: ${context}.

${scenarioRules(lastUserText)}

Если просят текст для чата — дай текст, который можно сразу отправить. Второй вариант давай только когда он реально полезен. Отвечай на русском.`;
}

function isComplex(text, messages) {
  const t = String(text || '').toLowerCase();
  const complexWords = /конфликт|спор|возраж|почему|объясни|разбер|проанализ|сравни|документ|несколько|вариант|сложн|ситуац|решение|аргумент|перепис|истори|подробн|слишком|не соглас|возмущ|претенз|несправед/;
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
          if (resp.statusCode < 200 || resp.statusCode >= 300) return reject(new Error(parsed?.error?.message || parsed?.message || `Yandex API ${resp.statusCode}`));
          const text = parsed?.choices?.[0]?.message?.content || '';
          if (!text) return reject(new Error('Пустой ответ модели'));
          resolve(text);
        } catch { reject(new Error('Некорректный ответ Yandex AI Studio')); }
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
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Нет сообщений' });
    if (!API_KEY || !FOLDER_ID) return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });

    // Для экономии отправляем модели только короткую рабочую историю.
    const userMessages = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')).slice(-8).map(m => ({
      role: m.role,
      content: String(m.content || '').slice(0, 2500)
    }));
    const lastUser = [...userMessages].reverse().find(m => m.role === 'user')?.content || '';
    const model = modelFor(lastUser, userMessages);
    const responseMessages = [{ role: 'system', content: buildSystemPrompt(profile || {}, lastUser) }, ...userMessages];

    let reply;
    try {
      reply = await requestYandex({
        model,
        messages: responseMessages,
        temperature: 0.9,
        max_tokens: 500
      });
    } catch (firstError) {
      if (model.endsWith('/aliceai-llm-flash')) {
        const fallbackModel = `gpt://${FOLDER_ID}/aliceai-llm`;
        reply = await requestYandex({ model: fallbackModel, messages: responseMessages, temperature: 0.9, max_tokens: 500 });
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
