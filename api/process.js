import { getJob, updateJob } from './_queue.js';

const apiKey = process.env.GROQ_API_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callAI(items) {
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
          content: 'Ответ только JSON'
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

  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'job not found' });
  }

  const items = job.data.items;

  const BATCH = 3;
  const results = [];

  try {
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);

      const r = await callAI(chunk);

      results.push(...r.results);

      updateJob(jobId, {
        progress: Math.round((i / items.length) * 100)
      });

      await sleep(2000);
    }

    updateJob(jobId, {
      status: 'done',
      progress: 100,
      result: results
    });

    return res.status(200).json({ ok: true });

  } catch (e) {
    updateJob(jobId, {
      status: 'error',
      error: String(e)
    });

    return res.status(500).json({ error: String(e) });
  }
}
