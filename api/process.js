import { getStore } from './_store.js';

const apiKey = process.env.GROQ_API_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGroq(items) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
          content: 'Отвечай только JSON'
        },
        {
          role: 'user',
          content: `
Верни строго JSON:
{
  "results": [
    {
      "translation": "",
      "customs_description": ""
    }
  ]
}

ДАННЫЕ:
${JSON.stringify(items)}
          `
        }
      ]
    })
  });

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;

  return JSON.parse(text);
}

export default async function handler(req, res) {
  const { jobId } = req.query;

  const store = getStore();
  const job = store.jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'not found' });
  }

  const BATCH = 5;
  const results = [];

  try {
    for (let i = 0; i < job.items.length; i += BATCH) {
      const chunk = job.items.slice(i, i + BATCH);

      const r = await callGroq(chunk);

      results.push(...r.results);

      job.progress = Math.round((i / job.items.length) * 100);

      await sleep(1200);
    }

    job.status = 'done';
    job.progress = 100;
    job.result = results;

    res.json({ ok: true });

  } catch (e) {
    job.status = 'error';
    job.error = String(e);

    res.status(500).json({ error: String(e) });
  }
}
