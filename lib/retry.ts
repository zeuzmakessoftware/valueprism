export class HttpStatusError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpStatusError'
    this.status = status
  }
}

type RetryOptions = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

const RETRIABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export function isRetriableHttpStatus(status: number) {
  return RETRIABLE_HTTP_STATUSES.has(status)
}

export function isRetriableError(error: unknown) {
  if (error instanceof HttpStatusError) {
    return isRetriableHttpStatus(error.status)
  }

  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      /timeout|timed out|fetch failed|network|socket|econnreset|econnrefused|enotfound/i.test(error.message)
    )
  }

  return false
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetries<T>(
  operation: (attempt: number) => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 700,
    maxDelayMs = 4000,
    shouldRetry = (error) => isRetriableError(error)
  }: RetryOptions = {}
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      const canRetry = attempt < attempts && shouldRetry(error, attempt)

      if (!canRetry) {
        throw error
      }

      const waitTime = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      await sleep(waitTime)
    }
  }

  throw new Error('Retry loop exited unexpectedly')
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}
