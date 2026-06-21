export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY не настроен в Vercel'
    });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items пустой'
    });
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const MAX_RETRIES = 5;

  async function callGroqWithRetry(batch, attempt = 1) {
    try {
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
            messages: [
              {
                role: 'system',
                content: 'Отвечай ТОЛЬКО JSON без текста.'
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

Количество строго = ${batch.length}

Данные:
${JSON.stringify(batch)}
                `
              }
            ],
            temperature: 0
          })
        }
      );

      const data = await response.json();

      // 🚨 RATE LIMIT
      if (data?.error?.code === 'rate_limit_exceeded') {
        if (attempt < MAX_RETRIES) {
          const wait = 2000 * attempt; // 2s, 4s, 6s...
          await sleep(wait);
          return callGroqWithRetry(batch, attempt + 1);
        }
        throw new Error('Rate limit exceeded after retries');
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

      if (!Array.isArray(parsed.results)) {
        throw new Error('Bad format');
      }

      return parsed.results;

    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
        return callGroqWithRetry(batch, attempt + 1);
      }
      throw err;
    }
  }

  try {
    const BATCH_SIZE = 3; // 🔥 маленькие батчи = стабильность

    const results = new Array(items.length).fill(null);

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batchItems = items.slice(i, i + BATCH_SIZE);

      const batchResult = await callGroqWithRetry(batchItems);

      batchResult.forEach((r, idx) => {
        results[i + idx] = r;
      });

      // 🔥 ключ к стабильности — пауза
      await sleep(2000);
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      details: String(err)
    });
  }
}
