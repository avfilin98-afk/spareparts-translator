import { getStore } from './_store.js';

const apiKey = process.env.GROQ_API_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔥 retry с backoff
async function callGroq(items, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
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
              content: 'Верни только JSON'
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

      if (!text) throw new Error('empty response');

      return JSON.parse(text);

    } catch (e) {
      if (i === retry - 1) throw e;
      await sleep(1500 * (i + 1)); // backoff
    }
  }
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

      // 🧠 кеш — если уже переводили такое
      const cachedChunk = chunk.map(t => {
        const c = store.cache.get(t);
        return c ? c : null;
      });

      const need = chunk.filter(t => !store.cache.has(t));

      let aiResult = [];

      if (need.length) {
        const r = await callGroq(need);

        aiResult = r.results;

        need.forEach((t, idx) => {
          store.cache.set(t, aiResult[idx]);
        });
      }

      const finalChunk = chunk.map(t => store.cache.get(t));

      results.push(...finalChunk);

      job.progress = Math.round((i / job.items.length) * 100);

      // защита от rate limit
      await sleep(1200);
    }

    job.status = 'done';
    job.progress = 100;
    job.result = results;

    return res.json({ ok: true });

  } catch (e) {
    job.status = 'error';
    job.error = String(e);

    return res.status(500).json({ error: String(e) });
  }
}
