import { getJob } from './_queue.js';

export default async function handler(req, res) {
  const { jobId } = req.query;

  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'job not found' });
  }

  return res.status(200).json(job.result || {});
}
