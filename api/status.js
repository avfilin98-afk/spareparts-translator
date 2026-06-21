import { getStore } from './_store.js';

export default async function handler(req, res) {
  const { jobId } = req.query;

  const store = getStore();

  const job = store.jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'not found' });
  }

  res.json(job);
}
