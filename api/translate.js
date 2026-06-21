export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items пустой' });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });
  }

  const prompt = `
Верни строго JSON:
{
  "results": [
    {
      "translation": "",
      "customs_description": ""
    }
  ]
}

Список:
${JSON.stringify(items)}
`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Отвечай только JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      })
    });

    const data = await response.json();

    console.log('GROQ RAW:', JSON.stringify(data, null, 2));

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({
        error: 'Пустой ответ от Groq',
        raw: data
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw e;
      parsed = JSON.parse(match[0]);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: 'Ошибка сервера',
      details: String(err)
    });
  }
}
