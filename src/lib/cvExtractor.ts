/**
 * Client-side CV text extraction utility.
 * Supports PDF (via pdfjs-dist) and plain text files.
 * Max file size: 1MB. No file is stored — only extracted text is used.
 */

const MAX_SIZE = 1 * 1024 * 1024 // 1 MB

export interface ExtractionResult {
  text: string
  pageCount?: number
  error?: string
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) {
    return `File too large. Maximum size is 1 MB (your file: ${(file.size / 1024 / 1024).toFixed(1)} MB)`
  }
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'txt'].includes(ext || '')) {
    return 'Only PDF and TXT files are supported'
  }
  return null
}

export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'txt') {
    return extractFromTxt(file)
  }

  if (ext === 'pdf') {
    return extractFromPdf(file)
  }

  return { text: '', error: 'Unsupported file type' }
}

async function extractFromTxt(file: File): Promise<ExtractionResult> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = (e.target?.result as string) || ''
      resolve({ text: text.trim() })
    }
    reader.onerror = () => resolve({ text: '', error: 'Failed to read text file' })
    reader.readAsText(file, 'utf-8')
  })
}

async function extractFromPdf(file: File): Promise<ExtractionResult> {
  try {
    // Dynamic import to avoid SSR issues
    const pdfjsLib = await import('pdfjs-dist')

    // Point the worker to the bundled version via CDN (avoids webpack worker issues)
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise

    const pages: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
      pages.push(pageText)
    }

    const text = pages.join('\n\n').replace(/\s+/g, ' ').trim()
    return { text, pageCount: pdf.numPages }
  } catch (err: any) {
    return { text: '', error: `PDF extraction failed: ${err?.message || 'Unknown error'}` }
  }
}
