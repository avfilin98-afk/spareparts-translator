export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY не настроен' });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items пустой' });
  }

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
            content: 'Ты возвращаешь только JSON.'
          },
          {
            role: 'user',
            content: `
Переведи список запчастей.

Верни строго JSON:
{
  "results": [
    {
      "translation": "",
      "customs_description": ""
    }
  ]
}

ВАЖНО:
- размер массива = ${items.length}
- без текста
- без markdown

ДАННЫЕ:
${JSON.stringify(items)}
            `
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (data?.error) {
    return res.status(502).json({
      error: 'Groq API error',
      details: data.error
    });
  }

  const text = data?.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({
      error: 'Bad JSON from model',
      raw: text
    });
  }
}
