const store = globalThis.__STORE__ || {
  jobs: new Map(),
  cache: new Map()
};

globalThis.__STORE__ = store;

export function getStore() {
  return store;
}
