import { fetchWithTimeout, HttpStatusError, withRetries } from '@/lib/retry'

const SEC_COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
const SEC_SUBMISSIONS_BASE_URL = 'https://data.sec.gov/submissions'
const SEC_ARCHIVES_BASE_URL = 'https://www.sec.gov/Archives/edgar/data'
const SEC_FETCH_TIMEOUT_MS = 20000
const SEC_FETCH_ATTEMPTS = 3

type SecCompanyTickerRecord = {
  cik_str: number
  ticker: string
  title: string
}

type SecCompanyTickerMap = Record<string, SecCompanyTickerRecord>

type SecRecentFilings = {
  form?: string[]
  accessionNumber?: string[]
  filingDate?: string[]
  primaryDocument?: string[]
}

type SecSubmissionsResponse = {
  filings?: {
    recent?: SecRecentFilings
  }
}

export type SecCompany = {
  cik: string
  ticker: string
  title: string
}

export type LatestTenK = {
  accessionNumber: string
  filingDate: string
  primaryDocument: string
  url: string
  content: string
}

function getSecHeaders() {
  return {
    'User-Agent': process.env.SEC_USER_AGENT ?? 'abide/0.1 (configure SEC_USER_AGENT for production use)',
    'Accept-Encoding': 'gzip, deflate'
  }
}

async function fetchSecJson<T>(url: string): Promise<T> {
  return withRetries(
    async () => {
      const response = await fetchWithTimeout(
        url,
        {
          headers: getSecHeaders()
        },
        SEC_FETCH_TIMEOUT_MS
      )

      if (!response.ok) {
        throw new HttpStatusError(response.status, `SEC request failed with status ${response.status}`)
      }

      return response.json() as Promise<T>
    },
    {
      attempts: SEC_FETCH_ATTEMPTS
    }
  )
}

async function fetchSecText(url: string): Promise<string> {
  return withRetries(
    async () => {
      const response = await fetchWithTimeout(
        url,
        {
          headers: getSecHeaders()
        },
        SEC_FETCH_TIMEOUT_MS
      )

      if (!response.ok) {
        throw new HttpStatusError(response.status, `SEC request failed with status ${response.status}`)
      }

      return response.text()
    },
    {
      attempts: SEC_FETCH_ATTEMPTS
    }
  )
}

export async function fetchCompanyTickerMap(): Promise<SecCompanyTickerMap> {
  return fetchSecJson<SecCompanyTickerMap>(SEC_COMPANY_TICKERS_URL)
}

export async function fetchCompanyTickers(): Promise<SecCompany[]> {
  const data = await fetchCompanyTickerMap()

  return Object.values(data).map((company) => ({
    cik: String(company.cik_str),
    ticker: company.ticker,
    title: company.title
  }))
}

function normalizeCompanyName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(incorporated|inc|corp|corporation|company|co|ltd|limited|holdings|holding|plc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function resolveSecCompany(companyName: string, companyTicker?: string): Promise<SecCompany> {
  const companies = await fetchCompanyTickers()
  const normalizedName = normalizeCompanyName(companyName)
  const loweredName = companyName.trim().toLowerCase()
  const loweredTicker = companyTicker?.trim().toLowerCase()

  if (loweredTicker) {
    const exactTickerMatch = companies.find((company) => company.ticker.toLowerCase() === loweredTicker)

    if (exactTickerMatch) {
      return exactTickerMatch
    }
  }

  const ranked = companies
    .map((company) => {
      const normalizedTitle = normalizeCompanyName(company.title)
      const loweredTitle = company.title.toLowerCase()
      let score = 0

      if (companyTicker && company.ticker.toLowerCase() === loweredTicker) score += 100
      if (loweredTitle === loweredName) score += 95
      if (normalizedTitle === normalizedName) score += 90
      if (normalizedTitle.startsWith(normalizedName) || normalizedName.startsWith(normalizedTitle)) score += 60
      if (loweredTitle.includes(loweredName) || loweredName.includes(loweredTitle)) score += 30
      if (normalizedTitle.includes(normalizedName) || normalizedName.includes(normalizedTitle)) score += 25

      return {
        company,
        score,
        titleLength: normalizedTitle.length
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.titleLength - right.titleLength
    })

  if (ranked.length === 0) {
    throw new Error(`Unable to resolve "${companyName}" to an SEC registrant`)
  }

  return ranked[0].company
}

export async function fetchLatestTenK(company: SecCompany): Promise<LatestTenK> {
  const paddedCik = company.cik.padStart(10, '0')
  const submissions = await fetchSecJson<SecSubmissionsResponse>(
    `${SEC_SUBMISSIONS_BASE_URL}/CIK${paddedCik}.json`
  )
  const recent = submissions.filings?.recent

  if (!recent?.form || !recent.accessionNumber || !recent.primaryDocument || !recent.filingDate) {
    throw new Error(`SEC submissions for ${company.title} are missing recent filing metadata`)
  }

  let filingIndex = recent.form.findIndex((form) => form === '10-K')

  if (filingIndex === -1) {
    filingIndex = recent.form.findIndex((form) => form === '10-K/A')
  }

  if (filingIndex === -1) {
    throw new Error(`No recent 10-K filing was found for ${company.title}`)
  }

  const accessionNumber = recent.accessionNumber[filingIndex]
  const filingDate = recent.filingDate[filingIndex]
  const primaryDocument = recent.primaryDocument[filingIndex]

  if (!accessionNumber || !filingDate || !primaryDocument) {
    throw new Error(`The latest 10-K filing for ${company.title} is missing required metadata`)
  }

  const archiveCik = String(Number(company.cik))
  const accessionWithoutDashes = accessionNumber.replace(/-/g, '')
  const primaryDocumentUrl = `${SEC_ARCHIVES_BASE_URL}/${archiveCik}/${accessionWithoutDashes}/${primaryDocument}`
  const indexUrl = `${SEC_ARCHIVES_BASE_URL}/${archiveCik}/${accessionWithoutDashes}/${accessionNumber}-index.html`

  try {
    const content = await fetchSecText(primaryDocumentUrl)

    return {
      accessionNumber,
      filingDate,
      primaryDocument,
      url: primaryDocumentUrl,
      content
    }
  } catch {
    const content = await fetchSecText(indexUrl)

    return {
      accessionNumber,
      filingDate,
      primaryDocument,
      url: indexUrl,
      content
    }
  }
}
