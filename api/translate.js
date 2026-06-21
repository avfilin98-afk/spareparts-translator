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
      error: 'items пустой'
    });
  }

  // 👉 СТАБИЛЬНЫЕ АКТУАЛЬНЫЕ МОДЕЛИ
  const models = [
    'deepseek/deepseek-chat-v3.1',
    'google/gemma-3-27b-it:free',
    'qwen/qwen3-coder:free'
  ];

  const prompt = `
Ты технический переводчик запчастей.

Верни строго JSON:
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
- без markdown
- без текста
- массив строго = ${items.length}

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
              content: 'Отвечай только JSON. Без текста и пояснений.'
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

    console.log('MODEL:', model);
    console.log('RAW:', JSON.stringify(data, null, 2));

    return { ok: response.ok, data };
  }

  function extractText(data) {
    if (data?.error) {
      throw new Error(JSON.stringify(data.error));
    }

    if (!data?.choices?.length) {
      throw new Error('Empty choices');
    }

    const text = data.choices[0]?.message?.content;

    if (!text) {
      throw new Error('Empty content');
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
    let finalText = null;
    let lastError = null;

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
        error: 'Все модели недоступны',
        details: lastError
      });
    }

    let parsed;

    try {
      parsed = safeParse(finalText);
    } catch (e) {
      return res.status(502).json({
        error: 'Невалидный JSON от модели',
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
