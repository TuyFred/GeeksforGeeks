import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, FileText, Maximize2 } from 'lucide-react'
import { api, getToken } from '../api/client'

export type PageRead = {
  page: number
  seconds: number
  minutes: number
  fullyRead: boolean
  visits: number
}

export type ReadingState = {
  pageCount: number
  secondsOpen: number
  minutesOpen: number
  pagesRead: number
  ready: boolean
  pages: PageRead[]
  moves: { fromPage: number; toPage: number; at: string }[]
}

const READY_SEC = 12

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes <= 0) return `${rest}s`
  return `${minutes}m ${rest}s`
}

export function PdfReader({
  courseId,
  lessonId,
  fileId,
  fileName,
  saved,
  onChange,
}: {
  courseId: string
  lessonId: string
  fileId: string
  fileName?: string
  saved?: ReadingState
  onChange: (reading: ReadingState) => void
}) {
  const [reading, setReading] = useState<ReadingState | undefined>(saved)
  const [seconds, setSeconds] = useState(Math.round(saved?.secondsOpen || 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [frameReady, setFrameReady] = useState(false)
  const started = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const src = useMemo(() => {
    const token = getToken() || ''
    return `/api/files/${fileId}?access_token=${encodeURIComponent(token)}#toolbar=1&navpanes=0`
  }, [fileId])

  const ready = Boolean(reading?.ready || saved?.ready || seconds >= READY_SEC)

  async function sync(body: Record<string, unknown>) {
    const result = await api<{ reading: ReadingState }>(
      `/learn/${courseId}/lessons/${encodeURIComponent(lessonId)}/reading`,
      { method: 'POST', body },
    )
    setReading(result.reading)
    onChangeRef.current(result.reading)
    return result.reading
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void sync({
      page: 1,
      seconds: Math.round(saved?.secondsOpen || 0),
      fullyRead: Boolean(saved?.ready),
      pageCount: Math.max(1, saved?.pageCount || 1),
      opened: true,
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not open notes.')
    })
  }, [courseId, lessonId, fileId])

  useEffect(() => {
    if (ready) return undefined
    const timer = window.setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1
        if (next % 5 === 0 || next >= READY_SEC) {
          void sync({
            page: 1,
            seconds: next,
            fullyRead: next >= READY_SEC,
            pageCount: 1,
            opened: false,
            confirmComplete: next >= READY_SEC,
          }).catch(() => undefined)
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [ready, courseId, lessonId])

  async function markFinished() {
    setBusy(true)
    setError('')
    try {
      const next = await sync({
        page: 1,
        seconds: Math.max(seconds, READY_SEC),
        fullyRead: true,
        pageCount: 1,
        opened: false,
        confirmComplete: true,
      })
      setSeconds(Math.max(seconds, READY_SEC))
      setReading(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save notes progress.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cls-notes">
      <div className="cls-notes-head">
        <div className="cls-notes-title">
          <FileText size={18} />
          <div>
            <strong>{fileName || 'Lesson notes'}</strong>
            <span>
              {ready
                ? 'Notes reviewed — you can mark this lesson complete.'
                : `Opens instantly below · review for ${READY_SEC}s or confirm when finished.`}
            </span>
          </div>
        </div>
        <div className="cls-notes-actions">
          <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Open in new tab
          </a>
          <a className="btn btn-ghost btn-sm" href={src} target="_blank" rel="noreferrer">
            <Maximize2 size={14} /> Full screen
          </a>
        </div>
      </div>

      {error && <div className="cls-gate-msg"><FileText size={14} /> {error}</div>}

      <div className={`cls-notes-frame-wrap${frameReady ? ' ready' : ''}`}>
        {!frameReady && <div className="cls-notes-loading">Opening notes…</div>}
        <iframe
          className="cls-notes-frame"
          title={fileName || 'Lesson notes'}
          src={src}
          onLoad={() => setFrameReady(true)}
        />
      </div>

      <div className="cls-notes-foot">
        <span><Clock size={14} /> Time on notes: {formatDuration(seconds)}</span>
        {ready ? (
          <span className="ok"><CheckCircle2 size={14} /> Ready to continue</span>
        ) : (
          <button type="button" className="btn btn-green btn-sm" onClick={() => void markFinished()} disabled={busy}>
            {busy ? 'Saving…' : "I've finished these notes"}
          </button>
        )}
      </div>
    </div>
  )
}
