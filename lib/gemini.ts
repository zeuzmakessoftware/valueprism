export type GeminiInlineData = {
  mimeType: string
  data: string
}

export type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
}

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/xml'
])

const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
])

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
  xml: 'application/xml'
}

export const MAX_DOCUMENTS = 6
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_DOCUMENT_BYTES = 20 * 1024 * 1024
export const MAX_TEXT_DOCUMENT_CHARS = 40000
export const MAX_TEN_K_CONTEXT_CHARS = 60000
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_REQUEST_TIMEOUT_MS = 45000
export const GEMINI_REQUEST_ATTEMPTS = 3

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
}

function inferMimeType(file: File) {
  if (file.type) {
    return file.type
  }

  const extension = file.name.split('.').pop()?.toLowerCase()

  if (!extension) {
    return 'application/octet-stream'
  }

  return MIME_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#160;|&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/section|\/article|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function collectSnippetRanges(text: string) {
  const windows: Array<{ start: number; end: number }> = []
  const patterns = [
    /\bitem\s+1\b.{0,40}\bbusiness\b/gi,
    /\boperating segments?\b/gi,
    /\breportable segments?\b/gi,
    /\bsegment information\b/gi,
    /\bproducts? and services\b/gi,
    /\bgeographic areas?\b/gi
  ]

  for (const pattern of patterns) {
    let matchCount = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) && matchCount < 2) {
      const start = Math.max(0, match.index - 900)
      const end = Math.min(text.length, match.index + 5200)
      windows.push({ start, end })
      matchCount += 1
    }
  }

  return windows
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((merged, current) => {
      const previous = merged[merged.length - 1]

      if (!previous || current.start > previous.end) {
        merged.push(current)
        return merged
      }

      previous.end = Math.max(previous.end, current.end)
      return merged
    }, [])
}

export function extractTenKContext(filingContent: string) {
  const text = filingContent.includes('<') ? stripHtml(filingContent) : filingContent.trim()
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\s+\n/g, '\n').trim()
  const ranges = collectSnippetRanges(normalized)

  if (ranges.length === 0) {
    return normalized.slice(0, MAX_TEN_K_CONTEXT_CHARS)
  }

  return ranges
    .map((range) => normalized.slice(range.start, range.end).trim())
    .join('\n\n---\n\n')
    .slice(0, MAX_TEN_K_CONTEXT_CHARS)
}

export function validateUploadedDocuments(documents: File[]) {
  if (documents.length > MAX_DOCUMENTS) {
    throw new Error(`Upload no more than ${MAX_DOCUMENTS} documents at a time`)
  }

  const totalBytes = documents.reduce((sum, file) => sum + file.size, 0)

  if (totalBytes > MAX_TOTAL_DOCUMENT_BYTES) {
    throw new Error('The combined upload size exceeds the 20 MB limit')
  }
}

export async function fileToGeminiParts(file: File): Promise<GeminiPart[]> {
  const mimeType = inferMimeType(file)
  const buffer = Buffer.from(await file.arrayBuffer())

  if (buffer.byteLength === 0) {
    throw new Error(`Uploaded file "${file.name}" is empty`)
  }

  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(`Uploaded file "${file.name}" exceeds the 10 MB limit`)
  }

  if (TEXT_MIME_TYPES.has(mimeType)) {
    const rawText = buffer.toString('utf8')
    const text = mimeType === 'text/html' ? stripHtml(rawText) : rawText.trim()

    if (!text) {
      throw new Error(`Uploaded file "${file.name}" did not contain readable text`)
    }

    return [
      {
        text: `Uploaded document: ${file.name}\n\n${text.slice(0, MAX_TEXT_DOCUMENT_CHARS)}`
      }
    ]
  }

  if (INLINE_MIME_TYPES.has(mimeType)) {
    return [
      {
        text: `Uploaded document: ${file.name}`
      },
      {
        inlineData: {
          mimeType,
          data: buffer.toString('base64')
        }
      }
    ]
  }

  throw new Error(
    `Unsupported file type for "${file.name}". Upload PDF, TXT, Markdown, HTML, CSV, JSON, or common image formats.`
  )
}

export function extractJsonObject(value: string) {
  const firstBrace = value.indexOf('{')
  const lastBrace = value.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('Gemini did not return a JSON object')
  }

  return value.slice(firstBrace, lastBrace + 1)
}

export function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const candidates: unknown[] =
    'candidates' in payload && Array.isArray(payload.candidates) ? payload.candidates : []

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return []
      }

      const content = 'content' in candidate ? candidate.content : undefined

      if (!content || typeof content !== 'object') {
        return []
      }

      const parts: unknown[] = 'parts' in content && Array.isArray(content.parts) ? content.parts : []

      return parts
        .map((part: unknown) => {
          if (!part || typeof part !== 'object') {
            return ''
          }

          return 'text' in part && typeof part.text === 'string' ? part.text : ''
        })
        .filter(Boolean)
    })
    .join('')
    .trim()
}

export async function readErrorDetail(response: Response) {
  try {
    const payload = await response.json()

    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload.error

      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message
      }
    }

    return JSON.stringify(payload)
  } catch {
    return response.text()
  }
}
