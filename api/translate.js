export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY не настроен'
    });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items пустой или неверный'
    });
  }

  const models = [
    'google/gemma-3-27b-it:free',
    'deepseek/deepseek-r1-0528-qwen3-8b:free',
    'qwen/qwen3-coder:free',
    'openrouter/auto'
  ];

  const prompt = `
Ты технический переводчик запчастей.

Верни СТРОГО JSON:
{
  "results": [
    {
      "translation": "",
      "customs_description": ""
    }
  ]
}

Правила:
- только JSON
- без текста
- без markdown
- массив = ${items.length}

Данные:
${JSON.stringify(items)}
`;

  async function callModel(model) {
    const response = await fetch(
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
              content: 'Отвечай только JSON. Без текста.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0
        })
      }
    );

    const data = await response.json();

    console.log(`MODEL: ${model}`);
    console.log('RAW OPENROUTER RESPONSE:', JSON.stringify(data, null, 2));

    return {
      ok: response.ok,
      data
    };
  }

  function extractText(data) {
    if (data?.error) {
      throw new Error(`OpenRouter error: ${JSON.stringify(data.error)}`);
    }

    if (!data?.choices?.length) {
      throw new Error('Empty choices from model');
    }

    const text = data.choices[0]?.message?.content;

    if (!text || typeof text !== 'string') {
      throw new Error('Empty content from model');
    }

    return text;
  }

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw e;
      return JSON.parse(match[0]);
    }
  }

  try {
    let lastError = null;
    let finalText = null;

    for (const model of models) {
      try {
        const r = await callModel(model);

        if (!r.ok) {
          lastError = r.data;
          continue;
        }

        finalText = extractText(r.data);
        break;
      } catch (e) {
        lastError = String(e);
      }
    }

    if (!finalText) {
      return res.status(502).json({
        error: 'Все модели недоступны или вернули пустой ответ',
        details: lastError
      });
    }

    let parsed;

    try {
      parsed = safeParse(finalText);
    } catch (e) {
      return res.status(502).json({
        error: 'Модель вернула невалидный JSON',
        raw: finalText
      });
    }

    if (!Array.isArray(parsed?.results)) {
      return res.status(502).json({
        error: 'Неверный формат ответа',
        raw: parsed
      });
    }

    return res.status(200).json({
      results: parsed.results
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Серверная ошибка',
      details: String(err)
    });
  }
}
