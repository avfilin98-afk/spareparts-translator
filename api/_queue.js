const jobs = new Map();

export function createJob(data) {
  const id = Date.now().toString();
  jobs.set(id, {
    id,
    status: 'pending',
    progress: 0,
    data,
    result: null,
    error: null
  });
  return id;
}

export function getJob(id) {
  return jobs.get(id);
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...patch });
}
