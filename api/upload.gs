import { getStore } from './_store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items empty' });
  }

  const store = getStore();

  const jobId = Date.now().toString();

  store.jobs.set(jobId, {
    status: 'pending',
    progress: 0,
    items,
    result: [],
    error: null
  });

  return res.json({ jobId });
}
