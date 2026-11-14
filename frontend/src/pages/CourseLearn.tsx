import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Award, CheckCircle2, ChevronRight, Circle, Clock,
  GraduationCap, BookOpen, Zap, AlertCircle, Headphones, PlayCircle, Lock, FileText,
} from 'lucide-react'
import { api, ApiError, getToken } from '../api/client'
import { PdfReader, type ReadingState } from '../components/PdfReader'
import { findCourse, coursePath } from '../data/catalog'
import { useApp } from '../context/AppContext'

type LessonItem = {
  id: string
  moduleId: string
  moduleTitle: string
  title: string
  type: 'read' | 'quiz' | 'video' | 'audio' | 'pdf'
  minutes?: number
  body?: string[]
  mediaUrl?: string
  fileId?: string
  fileName?: string
  passScore?: number
  questions?: { id: string; prompt: string; options: string[] }[]
}

type ModuleGroup = { id: string; title: string; lessons: LessonItem[] }

type MediaProg = { positionSec: number; watchedPct: number; mediaDone: boolean; completed?: boolean }

type LearnPayload = {
  course: { id: string; slug: string; title: string; tag: string }
  progress: number
  completed: number
  total: number
  status: string
  completedIds: string[]
  certificateId: string | null
  modules: ModuleGroup[]
  mediaProgress?: Record<string, MediaProg>
  reading?: Record<string, ReadingState>
  startHere?: { lessonId: string; lessonTitle: string; moduleTitle: string; level: number } | null
  startGuide?: string
}

function lessonMeta(item: LessonItem) {
  if (item.type === 'quiz') return `Quiz · ${item.passScore ?? 70}% to pass`
  if (item.type === 'video') return `Video · ${item.minutes ?? 4} min`
  if (item.type === 'audio') return `Audio · ${item.minutes ?? 3} min`
  if (item.type === 'pdf') return 'PDF · read each page'
  return `Lesson · ${item.minutes ?? 6} min`
}

function mediaSrc(lesson: LessonItem) {
  if (lesson.fileId) {
    const token = getToken() || ''
    return `/api/files/${lesson.fileId}?access_token=${encodeURIComponent(token)}`
  }
  return lesson.mediaUrl || ''
}

function MediaLesson({
  lesson,
  courseId,
  saved,
  onProgress,
}: {
  lesson: LessonItem
  courseId: string
  saved?: MediaProg
  onProgress: (next: MediaProg) => void
}) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const [pct, setPct] = useState(saved?.watchedPct || 0)
  const [done, setDone] = useState(Boolean(saved?.mediaDone || (saved?.watchedPct || 0) >= 95))
  const [ready, setReady] = useState(false)
  const maxReached = useRef(saved?.positionSec || 0)
  const lastSave = useRef(0)

  const persist = useCallback(async (positionSec: number, watchedPct: number, mediaDone: boolean) => {
    const now = Date.now()
    if (now - lastSave.current < 1200 && !mediaDone) return
    lastSave.current = now
    const payload = { positionSec, watchedPct, mediaDone }
    onProgress(payload)
    try {
      await api(`/learn/${courseId}/lessons/${encodeURIComponent(lesson.id)}/progress`, {
        method: 'PUT',
        body: payload,
      })
    } catch {
      /* offline: UI still tracks locally */
    }
  }, [courseId, lesson.id, onProgress])

  useEffect(() => {
    setPct(saved?.watchedPct || 0)
    setDone(Boolean(saved?.mediaDone || (saved?.watchedPct || 0) >= 95))
    maxReached.current = saved?.positionSec || 0
    setReady(false)
  }, [lesson.id, saved?.positionSec, saved?.watchedPct, saved?.mediaDone])

  function onLoaded() {
    const el = ref.current
    if (!el) return
    const resumeAt = Math.min(saved?.positionSec || 0, Math.max(0, (el.duration || 0) - 1))
    if (resumeAt > 1) {
      try { el.currentTime = resumeAt } catch { /* ignore */ }
    }
    maxReached.current = Math.max(maxReached.current, resumeAt)
    setReady(true)
  }

  function onTimeUpdate() {
    const el = ref.current
    if (!el || !el.duration) return
    // Block skipping ahead past what has been reached (+2s grace)
    if (el.currentTime > maxReached.current + 2) {
      el.currentTime = maxReached.current
      return
    }
    maxReached.current = Math.max(maxReached.current, el.currentTime)
    const watchedPct = Math.min(100, Math.round((maxReached.current / el.duration) * 100))
    setPct(watchedPct)
    const mediaDone = watchedPct >= 95 || el.ended
    if (mediaDone) setDone(true)
    void persist(el.currentTime, watchedPct, mediaDone)
  }

  function onEnded() {
    setPct(100)
    setDone(true)
    const el = ref.current
    void persist(el?.duration || maxReached.current, 100, true)
  }

  const isVideo = lesson.type === 'video'

  return (
    <div className={`cls-media ${isVideo ? 'is-video' : 'is-audio'}`}>
      <div className="cls-media-head">
        {isVideo ? <PlayCircle size={18} /> : <Headphones size={18} />}
        <div>
          <strong>{isVideo ? 'Video lesson' : 'Audio lesson'}</strong>
          <span>
            {done
              ? 'Finished — you can mark complete and continue.'
              : `Progress ${pct}% · finish to unlock Next (Previous is always allowed).`}
          </span>
        </div>
      </div>

      {isVideo ? (
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          className="cls-player"
          src={mediaSrc(lesson) || lesson.mediaUrl}
          controls
          controlsList="nodownload"
          playsInline
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onPause={onTimeUpdate}
        />
      ) : (
        <audio
          ref={ref as React.RefObject<HTMLAudioElement>}
          className="cls-player audio"
          src={mediaSrc(lesson) || lesson.mediaUrl}
          controls
          controlsList="nodownload"
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onPause={onTimeUpdate}
        />
      )}

      <div className="cls-media-bar">
        <div className="cls-media-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="cls-media-meta">
        <span>{ready ? `${pct}% complete` : 'Loading media…'}</span>
        {done ? <span className="ok"><CheckCircle2 size={14} /> Ready to finish</span> : <span>Keep watching / listening</span>}
      </div>
    </div>
  )
}

export function CourseLearn() {
  const { id, lessonId } = useParams()
  const navigate = useNavigate()
  const { user, openAuth } = useApp()
  const catalogCourse = findCourse(id)
  const [data, setData] = useState<LearnPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gateMsg, setGateMsg] = useState<string | null>(null)
  const [needsPayment, setNeedsPayment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [quizResult, setQuizResult] = useState<{
    score: number; passed: boolean; attemptNumber: number; correct: number; total: number
  } | null>(null)

  const items = useMemo(() => data?.modules.flatMap((m) => m.lessons) ?? [], [data])
  const activeId = lessonId ? decodeURIComponent(lessonId) : items[0]?.id
  const active = items.find((item) => item.id === activeId) ?? items[0]

  async function load() {
    if (!id) return
    try {
      const payload = await api<LearnPayload>(`/learn/${id}`)
      setData(payload)
      setError(null)
      setNeedsPayment(false)
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 402) {
        setNeedsPayment(true)
        setError('Complete payment to unlock this course.')
        return
      }
      setNeedsPayment(false)
      setError(err instanceof Error ? err.message : 'Could not load this course.')
    }
  }

  useEffect(() => { if (user) load() }, [user, id])
  useEffect(() => { setPicked([]); setQuizResult(null); setGateMsg(null) }, [active?.id])
  useEffect(() => {
    if (!data || lessonId || !items[0]) return
    const finished = new Set(data.completedIds)
    const start = items.find((item) => !finished.has(item.id)) || items[0]
    navigate(`/courses/${id}/learn/${encodeURIComponent(start.id)}`, { replace: true })
  }, [data, lessonId, items, id, navigate])

  if (!user) {
    return (
      <div className="cl-gate">
        <div className="cl-gate-card">
          <BookOpen size={40} strokeWidth={1.5} />
          <h2>Sign in to start learning</h2>
          <p>Track lessons, finish audio/video, and earn a certificate at 100%.</p>
          <button className="btn btn-green" onClick={() => openAuth('login')}>Sign In</button>
          <Link className="btn btn-ghost" to="/courses">Browse courses</Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cl-gate">
        <div className="cl-gate-card">
          <AlertCircle size={40} strokeWidth={1.5} style={{ color: needsPayment ? '#2f8d46' : '#dc2626' }} />
          <h2>{needsPayment ? 'Payment required' : 'Could not load course'}</h2>
          <p>{error}</p>
          {needsPayment && catalogCourse ? (
            <Link className="btn btn-green" to={coursePath(catalogCourse)}>Register &amp; Pay</Link>
          ) : (
            <Link className="btn btn-green" to="/courses">Browse courses</Link>
          )}
        </div>
      </div>
    )
  }

  if (!data || !active) {
    return (
      <div className="cl-loading">
        <div className="cl-spinner" />
        <p>Loading your classroom…</p>
      </div>
    )
  }

  const done = new Set(data.completedIds)
  const currentIndex = items.findIndex((item) => item.id === active.id)
  const next = items[currentIndex + 1]
  const prev = currentIndex > 0 ? items[currentIndex - 1] : null
  const title = catalogCourse?.title ?? data.course.title
  const totalModules = data.modules.length
  const completedModules = data.modules.filter((mod) =>
    mod.lessons.every((lesson) => done.has(lesson.id))
  ).length

  const media = data.mediaProgress?.[active.id]
  const pdfReady = Boolean(data.reading?.[active.id]?.ready) || done.has(active.id)
  const hasMedia = Boolean(active.fileId || active.mediaUrl)
  const mediaReady = active.type === 'read'
    || (active.type === 'pdf' && (!active.fileId || pdfReady))
    || ((active.type === 'video' || active.type === 'audio') && !hasMedia)
    || Boolean(media?.mediaDone)
    || (media?.watchedPct || 0) >= 95
    || done.has(active.id)

  function canOpen(item: LessonItem) {
    const idx = items.findIndex((x) => x.id === item.id)
    if (idx <= 0) return true
    if (done.has(item.id)) return true
    // Allow opening current or any completed; lock future until prior done
    for (let i = 0; i < idx; i += 1) {
      if (!done.has(items[i].id)) return false
    }
    return true
  }

  function go(item: LessonItem) {
    if (!canOpen(item) && item.id !== active.id) {
      setGateMsg('Finish the previous lesson before opening this one.')
      return
    }
    setGateMsg(null)
    navigate(`/courses/${id}/learn/${encodeURIComponent(item.id)}`)
  }

  function updateMediaProgress(nextProg: MediaProg) {
    setData((prev) => {
      if (!prev || !active) return prev
      return {
        ...prev,
        mediaProgress: {
          ...(prev.mediaProgress || {}),
          [active.id]: { ...(prev.mediaProgress?.[active.id] || { positionSec: 0, watchedPct: 0, mediaDone: false }), ...nextProg },
        },
      }
    })
  }

  async function completeLesson() {
    if (!active || active.type === 'quiz' || saving) return
    const needsMedia = (active.type === 'video' || active.type === 'audio') && Boolean(active.fileId || active.mediaUrl)
    const needsPdf = active.type === 'pdf' && Boolean(active.fileId)
    if ((needsMedia || needsPdf) && !mediaReady) {
      setGateMsg(active.type === 'audio'
        ? 'Listen to the full audio before finishing this lesson.'
        : active.type === 'pdf'
          ? 'Read every page of the PDF before finishing this lesson.'
          : 'Watch the full video before finishing this lesson.')
      return
    }
    setSaving(true)
    setGateMsg(null)
    try {
      if (needsMedia && mediaReady) {
        await api(`/learn/${id}/lessons/${encodeURIComponent(active.id)}/progress`, {
          method: 'PUT',
          body: { positionSec: 9999, watchedPct: 100, mediaDone: true },
        }).catch(() => undefined)
      }
      const result = await api<Pick<LearnPayload, 'progress' | 'completedIds' | 'certificateId' | 'status' | 'mediaProgress'>>(
        `/learn/${id}/lessons/${encodeURIComponent(active.id)}/complete`,
        { method: 'POST' },
      )
      setData((prev) => prev ? { ...prev, ...result } : prev)
      if (result.certificateId && (result.status === 'completed' || result.progress >= 100)) {
        // Stay on page so completion banner + download are visible
        return
      }
      if (next) go(next)
    } catch (err: unknown) {
      setGateMsg(err instanceof Error ? err.message : 'Could not save progress.')
    } finally {
      setSaving(false)
    }
  }

  async function submitQuiz() {
    if (!active || active.type !== 'quiz' || saving) return
    setSaving(true)
    setGateMsg(null)
    try {
      const result = await api<{
        score: number; passed: boolean; attemptNumber: number
        correct: number; total: number
        progress: number; completedIds: string[]
        certificateId: string | null; status: string
      }>(`/learn/${id}/lessons/${encodeURIComponent(active.id)}/quiz`, {
        method: 'POST',
        body: { answers: picked },
      })
      setQuizResult({ score: result.score, passed: result.passed, attemptNumber: result.attemptNumber, correct: result.correct, total: result.total })
      setData((prev) => prev ? {
        ...prev,
        progress: result.progress,
        completedIds: result.completedIds,
        certificateId: result.certificateId,
        status: result.status,
      } : prev)
      if (result.passed && result.certificateId && (result.status === 'completed' || result.progress >= 100)) {
        // Keep student on page to download certificate
      }
    } catch (err: unknown) {
      setGateMsg(err instanceof Error ? err.message : 'Could not submit the quiz.')
    } finally {
      setSaving(false)
    }
  }

  const canGoNext = done.has(active.id) || (active.type === 'quiz' && quizResult?.passed)

  return (
    <div className="classroom">
      <aside className="cls-side">
        <div className="cls-side-inner">
          <Link className="cls-back" to="/dashboard">‹ My Learning</Link>
          <h2 className="cls-title">{title}</h2>

          <div className="cls-progress-block">
            <div className="cls-progress-row">
              <span>{data.progress}% complete</span>
              <span>{data.completed}/{data.total}</span>
            </div>
            <div className="cls-progress-bar">
              <div className="cls-progress-fill" style={{ width: `${data.progress}%` }} />
            </div>
            <div className="cls-progress-meta">
              <span><BookOpen size={12} /> {completedModules}/{totalModules} modules</span>
              {data.certificateId && (
                <Link to={`/certificates/${data.certificateId}`} className="cls-cert-link">
                  <Award size={12} /> Certificate ready
                </Link>
              )}
            </div>
          </div>

          <nav className="cls-nav" aria-label="Course lessons">
            {data.modules.map((mod, mi) => {
              const modDone = mod.lessons.every((l) => done.has(l.id))
              return (
                <div key={mod.id} className="cls-module">
                  <div className={`cls-mod-head${modDone ? ' cls-mod-done' : ''}`}>
                    <span className="cls-mod-num">{String(mi + 1).padStart(2, '0')}</span>
                    <span>{mod.title}</span>
                    {modDone && <CheckCircle2 size={14} />}
                  </div>
                  {mod.lessons.map((item) => {
                    const isActive = item.id === active.id
                    const isDone = done.has(item.id)
                    const locked = !canOpen(item)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`cls-lesson${isActive ? ' cls-active' : ''}${isDone ? ' cls-done' : ''}${locked ? ' cls-locked' : ''}`}
                        onClick={() => go(item)}
                        disabled={locked && !isDone}
                      >
                        <span className="cls-lesson-icon">
                          {locked && !isDone
                            ? <Lock size={15} />
                            : isDone
                              ? <CheckCircle2 size={15} />
                              : item.type === 'quiz'
                                ? <Zap size={15} />
                                : item.type === 'video'
                                  ? <PlayCircle size={15} />
                                  : item.type === 'audio'
                                    ? <Headphones size={15} />
                                    : item.type === 'pdf'
                                      ? <FileText size={15} />
                                      : <Circle size={15} />}
                        </span>
                        <span className="cls-lesson-text">
                          <span className="cls-lesson-title">{item.title}</span>
                          <span className="cls-lesson-meta">{lessonMeta(item)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </div>
      </aside>

      <main className="cls-main">
        <div className="cls-topbar">
          <div className="cls-breadcrumb">
            <span>{active.moduleTitle}</span>
            <ChevronRight size={14} />
            <span>{active.title}</span>
          </div>
          <div className="cls-topbar-right">
            {active.type === 'read' && <span className="cls-time"><Clock size={13} /> {active.minutes ?? 6} min read</span>}
            {active.type === 'pdf' && <span className="cls-time"><FileText size={13} /> PDF</span>}
            {active.type === 'video' && <span className="cls-time"><PlayCircle size={13} /> Video</span>}
            {active.type === 'audio' && <span className="cls-time"><Headphones size={13} /> Audio</span>}
            {active.type === 'quiz' && <span className="cls-quiz-tag"><Zap size={13} /> Quiz</span>}
          </div>
        </div>

        <div className="cls-content">
          <h1 className="cls-lesson-h1">{active.title}</h1>
          {data.status !== 'completed' && data.startGuide && (
            <div className="cls-start-guide">
              <strong>Where to start</strong>
              <p>{data.startGuide}</p>
              {data.startHere && data.startHere.lessonId !== active.id && (
                <button
                  type="button"
                  className="btn btn-green btn-sm"
                  onClick={() => {
                    const target = items.find((item) => item.id === data.startHere?.lessonId)
                    if (target) go(target)
                  }}
                >
                  Open Level {data.startHere.level}: {data.startHere.lessonTitle}
                </button>
              )}
            </div>
          )}
          {gateMsg && <div className="cls-gate-msg"><Lock size={14} /> {gateMsg}</div>}

          {(active.type === 'read' || active.type === 'video' || active.type === 'audio' || active.type === 'pdf') && (
            <>
              {(active.type === 'video' || active.type === 'audio') && (
                <MediaLesson
                  lesson={{ ...active, mediaUrl: mediaSrc(active) }}
                  courseId={String(id)}
                  saved={data.mediaProgress?.[active.id]}
                  onProgress={updateMediaProgress}
                />
              )}
              {active.type === 'pdf' && active.fileId && (
                <PdfReader
                  key={active.id}
                  courseId={String(id)}
                  lessonId={active.id}
                  fileId={active.fileId}
                  fileName={active.fileName || active.title}
                  saved={data.reading?.[active.id]}
                  onChange={(next) => setData((prev) => prev ? {
                    ...prev,
                    reading: { ...(prev.reading || {}), [active.id]: next },
                  } : prev)}
                />
              )}
              {active.type === 'pdf' && !active.fileId && (
                <div className="cls-gate-msg"><FileText size={14} /> Notes file is missing for this lesson. Contact your instructor.</div>
              )}

              <div className={`cls-prose${active.type === 'read' ? ' cls-notes-prose' : ''}`}>
                {active.type === 'read' && <p className="cls-notes-label"><FileText size={14} /> Reading notes</p>}
                {(active.body ?? []).map((para, i) => <p key={i}>{para}</p>)}
              </div>

              {(data.status === 'completed' || data.progress >= 100) && data.certificateId && (
                <div className="cls-completed-banner">
                  <GraduationCap size={24} />
                  <div>
                    <strong>Course completed — certificate unlocked</strong>
                    <p>You finished every lesson. Download and print your official certificate.</p>
                  </div>
                  <Link className="btn btn-green" to={`/certificates/${data.certificateId}`}>
                    <Award size={16} /> Download certificate
                  </Link>
                </div>
              )}

              <div className="cls-lesson-footer">
                <div className="cls-lesson-nav">
                  {prev && (
                    <button type="button" className="btn btn-ghost" onClick={() => go(prev)}>
                      ‹ Previous
                    </button>
                  )}
                  {done.has(active.id) ? (
                    next ? (
                      <button type="button" className="btn btn-green" onClick={() => go(next)}>
                        Next lesson <ChevronRight size={16} />
                      </button>
                    ) : data.certificateId ? (
                      <Link className="btn btn-green" to={`/certificates/${data.certificateId}`}>
                        <Award size={16} /> Download certificate
                      </Link>
                    ) : (
                      <span className="cls-lesson-complete-badge">
                        <CheckCircle2 size={16} /> All lessons done!
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      className="btn btn-green"
                      onClick={completeLesson}
                      disabled={saving || !mediaReady}
                      title={!mediaReady ? 'Finish media first' : undefined}
                    >
                      {saving ? 'Saving…' : !mediaReady ? (active.type === 'pdf' ? 'Read every page to continue' : 'Finish media to continue') : 'Mark as complete'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {active.type === 'quiz' && (
            <div className="cls-quiz">
              <div className="cls-quiz-intro">
                <Zap size={20} />
                <div>
                  <strong>Module assessment</strong>
                  <p>Score at least {active.passScore ?? 70}% to unlock the next lesson. Previous is always available.</p>
                </div>
              </div>

              {quizResult && (
                <div className={`cls-quiz-result ${quizResult.passed ? 'cls-quiz-pass' : 'cls-quiz-fail'}`}>
                  <span className="cls-quiz-score">{quizResult.score}%</span>
                  <div>
                    <strong>{quizResult.passed ? 'Passed!' : 'Not quite — try again'}</strong>
                    <p>Attempt {quizResult.attemptNumber} · {quizResult.correct}/{quizResult.total} correct</p>
                  </div>
                  {quizResult.passed && data.certificateId && (data.status === 'completed' || data.progress >= 100) && (
                    <Link className="btn btn-green" to={`/certificates/${data.certificateId}`}>
                      <Award size={16} /> Download certificate
                    </Link>
                  )}
                  {quizResult.passed && next && !(data.certificateId && data.progress >= 100) && (
                    <button className="btn btn-green" type="button" onClick={() => go(next)}>
                      Continue <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); submitQuiz() }} className="cls-quiz-form">
                {(active.questions ?? []).map((q, qi) => (
                  <fieldset key={q.id} className="cls-qfield">
                    <legend className="cls-qlegend">
                      <span className="cls-qnum">Q{qi + 1}</span>
                      {q.prompt}
                    </legend>
                    <div className="cls-options">
                      {q.options.map((opt, oi) => {
                        const sel = picked[qi] === oi
                        return (
                          <label key={opt} className={`cls-option${sel ? ' cls-option-sel' : ''}`}>
                            <input
                              type="radio"
                              name={q.id}
                              checked={sel}
                              onChange={() => setPicked((prev) => {
                                const next2 = [...prev]
                                next2[qi] = oi
                                return next2
                              })}
                            />
                            <span className="cls-option-letter">{String.fromCharCode(65 + oi)}</span>
                            {opt}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}

                <div className="cls-quiz-footer">
                  {prev && (
                    <button type="button" className="btn btn-ghost" onClick={() => go(prev)}>‹ Previous</button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-green"
                    disabled={saving || !(active.questions ?? []).every((_, i) => Number.isInteger(picked[i]))}
                  >
                    {saving ? 'Checking…' : done.has(active.id) ? 'Retake quiz' : 'Submit answers'}
                  </button>
                  {canGoNext && next && (
                    <button type="button" className="btn btn-ghost" onClick={() => go(next)}>
                      Next <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
