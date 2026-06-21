import { createJob } from './_queue.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items пустой' });
  }

  const jobId = createJob({ items });

  return res.status(200).json({ jobId });
}
