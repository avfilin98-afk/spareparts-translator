export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY не настроен на сервере'
    });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Не передан список товаров (items)'
    });
  }

  const fallbackModels = [
    'google/gemma-3-27b-it:free',
    'openai/gpt-oss-120b:free',
    'deepseek/deepseek-r1-0528:free',
    'qwen/qwen3-coder:free',
    'openrouter/auto'
  ];

  const models = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL, ...fallbackModels]
    : fallbackModels;

  const prompt = `Ты - технический переводчик и специалист по таможенному декларированию запчастей для электроинструмента и бензоинструмента.

Тебе дан список названий товаров на китайском и/или английском языке.

Для КАЖДОГО элемента списка верни:

1. "translation" - точный технический перевод названия на русский язык.
2. "customs_description" - краткое описание для таможенной декларации.

Сохраняй артикулы, коды моделей и номера деталей без изменений.

Верни ответ СТРОГО в формате JSON:

{
  "results": [
    {
      "translation": "...",
      "customs_description": "..."
    }
  ]
}

Количество элементов в results должно точно совпадать с количеством входных элементов.

Список товаров:
${JSON.stringify(items)}`;

  try {
    let response = null;
    let lastErrText = '';
    let usedModel = '';

    for (const model of models) {
      try {
        response = await fetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
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
                  content:
                    'Отвечай только валидным JSON объектом. Без markdown, без пояснений.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0,
              max_tokens: 4000,
              response_format: {
                type: 'json_object'
              }
            })
          }
        );

        if (response.ok) {
          usedModel = model;
          break;
        }

        lastErrText = await response.text();

        console.error(
          `Модель ${model} недоступна:`,
          lastErrText
        );
      } catch (e) {
        console.error(`Ошибка модели ${model}:`, e);
      }
    }

    if (!response || !response.ok) {
      return res.status(502).json({
        error: 'Ошибка от OpenRouter API (все модели недоступны)',
        details: lastErrText
      });
    }

    const data = await response.json();

    console.log('Использована модель:', usedModel);

    const text =
      data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({
        error: 'Пустой ответ от нейросети',
        raw: data
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const cleaned = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      parsed = JSON.parse(cleaned);
    }

    const resultsArray = parsed?.results;

    if (
      !Array.isArray(resultsArray) ||
      resultsArray.length !== items.length
    ) {
      return res.status(502).json({
        error: 'Нейросеть вернула неожиданный формат',
        raw: text,
        model: usedModel
      });
    }

    return res.status(200).json({
      model: usedModel,
      results: resultsArray
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Внутренняя ошибка сервера',
      details: String(err)
    });
  }
}
