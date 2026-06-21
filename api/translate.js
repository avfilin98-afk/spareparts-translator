// Это серверная функция (работает на Vercel).
// Она принимает список названий запчастей и просит нейросеть (через OpenRouter, бесплатная модель)
// перевести их на технический русский и написать описание для таможенной декларации.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENROUTER_API_KEY не настроен на сервере' });
    return;
  }

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Не передан список товаров (items)' });
    return;
  }

  const fallbackModels = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'qwen/qwen3-coder:free',
    'google/gemini-2.0-flash-exp:free',
    'mistralai/mistral-7b-instruct:free'
  ];
  const models = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL, ...fallbackModels]
    : fallbackModels;

  const prompt = `Ты - технический переводчик и специалист по таможенному декларированию запчастей для электроинструмента и бензоинструмента (например: дрели, болгарки, бензопилы, триммеры, генераторы и т.п.).

Тебе дан список названий товаров на китайском и/или английском языке (могут быть смешаны, могут быть артикулы и коды моделей - их нужно сохранить как есть, не переводить).

Для КАЖДОГО элемента списка верни:
1. "translation" - точный технический перевод названия на русский язык, как принято в каталогах запчастей (используй стандартную техническую терминологию, сохраняй артикулы/коды моделей без изменений).
2. "customs_description" - короткое формальное описание товара на русском для таможенной декларации (что это, назначение, материал если можно определить, без лишних слов, в стиле "Запчасть для ... , предназначена для ...").

Верни ОТВЕТ СТРОГО в формате JSON-объекта (без пояснений, без markdown, без обратных кавычек) с одним полем "results", которое содержит массив. Длина массива должна точно совпадать с количеством элементов входного списка и в том же порядке.

Формат ответа:
{"results": [{"translation": "...", "customs_description": "..."}, ...]}

Входной список (каждый элемент - отдельный товар):
${JSON.stringify(items, null, 0)}`;

  try {
    let response;
    let lastErrText = '';
    let usedModel = '';

    for (const model of models) {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://spareparts-translator.vercel.app',
          'X-Title': 'Spareparts Translator'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'Ты отвечаешь только в формате JSON, без пояснений и без markdown.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        usedModel = model;
        break;
      }

      lastErrText = await response.text();
    }

    if (!response || !response.ok) {
      res.status(502).json({ error: 'Ошибка от OpenRouter API (все модели недоступны)', details: lastErrText });
      return;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      res.status(502).json({ error: 'Пустой ответ от нейросети', raw: data });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const cleaned = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const resultsArray = parsed?.results;

    if (!Array.isArray(resultsArray) || resultsArray.length !== items.length) {
      res.status(502).json({ error: 'Нейросеть вернула неожиданный формат', raw: text });
      return;
    }

    res.status(200).json({ results: resultsArray });
  } catch (err) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера', details: String(err) });
  }
}
