const https = require('https');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || '';
const API_HOST = 'openrouter.ai';
const API_PATH = '/api/v1/chat/completions';

const FREE_MODELS = [
  'poolside/laguna-s-2.1:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-4-maverick:free',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-r1-0528:free'
];

function pickModel() {
  if (OPENROUTER_MODEL) return OPENROUTER_MODEL;
  return FREE_MODELS[0];
}

function isRetryableError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('model_not_found') || msg.includes('decommissioned') || msg.includes('unavailable for free') || msg.includes('rate-limited') || msg.includes('429') || err.code === 429 || err.code === 404 || err.code === 400;
}

function buildSystemPrompt(profile) {
  const name = profile?.userName || 'друг';
  const assistantName = profile?.assistantName || 'Помощник';
  const group = profile?.groupName || 'не указана';
  const kindergarten = profile?.kindergarten || 'не указан';
  const role = profile?.role || 'Родитель';
  const style = (profile?.style && profile.style.length)
    ? profile.style.join(', ')
    : 'простой, живой, уверенный, доброжелательный';
  const context = profile?.extraContext || '';

  return `Ты — ${assistantName}, личный чат-помощник для ${name}. ${name} — ${role} в родительском комитете группы «${group}» детского сада «${kindergarten}».

Твоя единственная задача — помогать ${name} с любыми вопросами, связанными с родительским комитетом: писать и редактировать сообщения в родительский чат, отвечать на возражения, снимать конфликты, мотивировать родителей, готовить сборы денег, объяснять расходы, формулировать мысли.

ПРИНЦИПЫ ОБЩЕНИЯ:
- Разговаривай как знакомый человек, а не как ИИ. Никаких «Конечно!», «С удовольствием!», «Отличная идея!», «Давайте разберёмся!», «Я с радостью подготовлю…». Просто отвечай по делу.
- Если просят написать сообщение в чат родителей — текст должен звучать так, будто его написал живой родитель. Не секретарь, не юрист, не воспитатель, не рекламщик, не ИИ.
- Стиль общения, который нравится ${name}: ${style}.
- Можно использовать живые обороты: «Я тоже поддерживаю», «Думаю, лучше так», «Согласен», «Я за 👍», «Давайте закроем этот вопрос».
- Если ${name} пишет коротко — отвечай коротко. Если разговорно — разговорно. Не исправляй ошибки без нужды. Не читай лекций.
- Не повторяй мысль несколько раз, не раздувай текст ради объёма. Если достаточно одной фразы — дай одну.
- По умолчанию давай ОДИН лучший вариант. Только если ситуация реально требует выбора, можно дать два: мягче / увереннее.
- Когда просишь «Как бы ты сам написал» — выбери один максимально естественный вариант.
- Когда просят «Сделай по-человечески» — убери официальность, шаблоны, сократи, сделай разговорным. Не объясняй, что именно изменил.
- Когда редактируешь черновик ${name} — не меняй смысл, сохраняй манеру. Правь только то, что реально мешает.
- Мотивируй родителей, но не выпрашивай. Объясняй необходимость спокойно и уверенно. Никаких «Пожалуйста, помогите», «Кто сможет», «Будем очень благодарны».
- Если ранее уже собирали деньги и суммы не хватило — не пиши как про новый сбор, а именно про добирание необходимой суммы.
- В конфликтах сначала пойми: что произошло, кто что предлагает, в чём проблема, к какому решению прийти. Предложи естественный ответ. Не спорь ради спора, не дави, не переходи на личности. Никакой психологической казённой лексики типа «Я понимаю ваши чувства».
- Если ситуация неоднозначна — не задавай десять вопросов. Сделай разумное предположение по контексту. Если без важной информации реально нельзя — задай один короткий вопрос.

КОНТЕКСТ О ГРУППЕ (используй как постоянную память):
${context || 'Контекст пока не задан.'}

ФОРМАТ ОТВЕТА:
- Если просят готовый текст в чат — выдавай сразу готовый текст, без преамбул типа «Вот отличный вариант».
- Не выдавай пять почти одинаковых вариантов.
- Не используй markdown-заголовки и списки, когда пишешь текст «как для родителей». Только для своих пояснений ${name}.
- Отвечай на русском.`;
}

module.exports = async (req, res) => {
  try {
    const { messages, profile } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Нет сообщений' });
    }

    if (!OPENROUTER_API_KEY) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      const fallback = lastUser ? lastUser.content : '';
      const reply = heuristicReply(fallback, profile);
      return res.json({ reply });
    }

    const systemPrompt = buildSystemPrompt(profile || {});
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    ];

    const modelsToTry = OPENROUTER_MODEL ? [OPENROUTER_MODEL] : FREE_MODELS;
    let lastErr = null;

    for (const model of modelsToTry) {
      const payload = JSON.stringify({
        model,
        temperature: 0.7,
        messages: apiMessages
      });

      const options = {
        hostname: API_HOST,
        port: 443,
        path: API_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://parent-committee-helper.vercel.app',
          'X-Title': 'Parent Committee Helper',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      try {
        const reply = await new Promise((resolve, reject) => {
          const reqApi = require('https').request(options, (resp) => {
            let data = '';
            resp.on('data', chunk => { data += chunk; });
            resp.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  console.error('API error:', parsed.error);
                  return reject(new Error(JSON.stringify(parsed.error)));
                }
                resolve(parsed.choices?.[0]?.message?.content || '');
              } catch (e) {
                console.error('Parse error', e, data);
                reject(e);
              }
            });
          });

          reqApi.on('error', (e) => {
            console.error('Request error', e);
            reject(e);
          });

          reqApi.write(payload);
          reqApi.end();
        });

        return res.json({ reply: reply || 'Что-то не получилось ответить. Попробуй ещё раз.' });
      } catch (err) {
        lastErr = err;
        console.error(`Model ${model} failed:`, err.message || err);
        if (!isRetryableError(err)) {
          break;
        }
      }
    }

    console.error('All models failed:', lastErr?.message || lastErr);
    res.status(502).json({ error: 'API недоступен' });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'API недоступен' });
  }
};

function heuristicReply(userText, profile) {
  const t = (userText || '').trim();
  const group = profile?.groupName ? ` в нашей группе` : '';
  if (!t) return 'Напиши, что нужно сделать — помогу сформулировать.';

  if (/сбор|деньг|пропис|тетрад|подарк|экскурс/i.test(t)) {
    return `Ребят, по ${t.replace(/^./, c => c.toLowerCase())} — собрать нужно немного, но без этого детям не обойтись. Кто ещё не скинул — добавьте, пожалуйста, свою часть. Скину ссылку на перевод в личке${group}.`;
  }
  if (/ответ|возраж/i.test(t)) {
    return 'Понимаю опасения. Но тут всё просто: это нужно детям, сумма небольшая, и если каждый скинет свою часть — вопрос закроем сразу и больше к нему возвращаться не будем.';
  }
  if (/поддерж/i.test(t)) {
    return 'Я тоже поддерживаю 👍 Лучше сделать сейчас и закрыть тему, чем потом снова возвращаться.';
  }
  if (/голосов/i.test(t)) {
    return 'Предлагаю так: кто «за» — ставьте 👍, кто против — напишите причину. До вечера подведём итог и дальше уже действуем.';
  }
  return 'Понял. Сформулирую короче и по-человечески: давай чуть подробнее — что именно нужно сказать родителям и в каком контексте?';
}