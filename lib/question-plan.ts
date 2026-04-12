export type AnalysisQuestion = {
  businessUnit: string
  question: string
}

export type AnalysisResult = {
  company: {
    name: string
    ticker: string
  }
  latestTenK: {
    filingDate: string
    accessionNumber: string
    url: string
  }
  businessUnits: string[]
  questions: AnalysisQuestion[]
}

export const QUESTION_PLAN_STAGE_SEQUENCE = [
  'preparing-analysis',
  'resolving-company',
  'loading-10k',
  'extracting-business-units',
  'preparing-documents',
  'generating-questions',
  'finalizing-response'
] as const

export type QuestionPlanStageId = (typeof QUESTION_PLAN_STAGE_SEQUENCE)[number]

export const QUESTION_PLAN_STAGE_DETAILS: Record<
  QuestionPlanStageId,
  {
    title: string
    description: string
  }
> = {
  'preparing-analysis': {
    title: 'Preparing analysis',
    description: 'Validating the request and organizing the uploaded materials.'
  },
  'resolving-company': {
    title: 'Resolving company',
    description: 'Matching the company name against the SEC registrant records.'
  },
  'loading-10k': {
    title: 'Loading latest 10-K',
    description: 'Fetching the newest annual filing from the SEC archive.'
  },
  'extracting-business-units': {
    title: 'Extracting business units',
    description: 'Locating the business and segment language inside the 10-K.'
  },
  'preparing-documents': {
    title: 'Preparing uploaded documents',
    description: 'Converting the uploaded files into Gemini-ready inputs.'
  },
  'generating-questions': {
    title: 'Generating review questions',
    description: 'Sending the 10-K context and your documents to Gemini.'
  },
  'finalizing-response': {
    title: 'Finalizing response',
    description: 'Normalizing the output so the review flow opens with structured questions.'
  }
}

export const QUESTION_PLAN_MAX_ATTEMPTS = 3

export type QuestionPlanProgressPayload = {
  stageId: QuestionPlanStageId
  title: string
  description: string
}

export type QuestionPlanRetryPayload = {
  attempt: number
  maxAttempts: number
  description: string
}

export type QuestionPlanCompletePayload = {
  result: AnalysisResult
}

export type QuestionPlanErrorPayload = {
  message: string
}
