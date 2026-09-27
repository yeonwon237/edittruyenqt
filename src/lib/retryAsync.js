// Cloud auth restoration and the first Supabase request can briefly overlap
// after a cold start on mobile. Read operations are safe to retry, and a
// short backoff prevents a harmless first-request hiccup from surfacing as a
// scary project-load error.
export async function retryAsync(operation, { attempts = 2, delayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await new Promise((resolve) => window.setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
