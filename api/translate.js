export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY не настроен'
    });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items пустой'
    });
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const BATCH_SIZE = 2;          // 🔥 максимально маленький батч
  const BASE_DELAY = 2500;       // 🔥 базовая пауза
  const MAX_RETRIES = 6;

  async function callGroq(batch, attempt = 1) {
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'Отвечай только JSON без текста.'
            },
            {
              role: 'user',
              content: `
Верни JSON:
{
  "results": [
    { "translation": "", "customs_description": "" }
  ]
}

Строго ${batch.length} элементов.

Данные:
${JSON.stringify(batch)}
              `
            }
          ]
        })
      }
    );

    const data = await response.json();

    // 🔥 RATE LIMIT HANDLING
    if (data?.error?.code === 'rate_limit_exceeded') {
      if (attempt <= MAX_RETRIES) {
        const wait = BASE_DELAY * attempt;
        await sleep(wait);
        return callGroq(batch, attempt + 1);
      }
      throw new Error('Rate limit exceeded permanently');
    }

    if (data?.error) {
      throw new Error(JSON.stringify(data.error));
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Empty response');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match[0]);
    }

    return parsed.results;
  }

  try {
    const results = new Array(items.length).fill(null);

    // 🚨 ВАЖНО: строго по очереди
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const batchResult = await callGroq(batch);

      batchResult.forEach((r, idx) => {
        results[i + idx] = r;
      });

      // 🔥 ЖЁСТКАЯ ПАУЗА — ключ к стабильности
      await sleep(BASE_DELAY);
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: String(err)
    });
  }
}
