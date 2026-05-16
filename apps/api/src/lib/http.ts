interface JsonRequestOptions {
  headers?: Record<string, string>
  searchParams?: Record<string, string | number | boolean | undefined>
  json?: unknown
  timeoutMs?: number
  method?: string
}

function buildUrl(url: string, searchParams?: JsonRequestOptions['searchParams']) {
  const parsed = new URL(url)
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value !== undefined) parsed.searchParams.set(key, String(value))
  })
  return parsed
}

export async function requestJson<T>(
  url: string,
  { headers = {}, searchParams, json, timeoutMs = 10_000, method }: JsonRequestOptions = {}
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(buildUrl(url, searchParams), {
      method: method ?? (json === undefined ? 'GET' : 'POST'),
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function requestOk(
  url: string,
  options: Omit<JsonRequestOptions, 'json'> = {}
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
    const res = await fetch(buildUrl(url, options.searchParams), {
      method: options.method ?? 'GET',
      headers: options.headers,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
