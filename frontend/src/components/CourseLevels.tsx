import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDown, ArrowUp, CheckCircle2, FileText, Headphones, Layers,
  PlayCircle, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { api, uploadFile } from '../api/client'

type LessonType = 'read' | 'pdf' | 'video' | 'audio'

type LessonDraft = {
  key: string
  title: string
  type: LessonType
  fileId?: string
  fileName?: string
  mediaUrl?: string
  body?: string[]
  notes?: string
  minutes?: number
}

type LevelDraft = {
  id: string
  title: string
  lessons: LessonDraft[]
}

const TYPE_META: Record<LessonType, { label: string; hint: string; accept: string; Icon: typeof FileText }> = {
  pdf: { label: 'PDF notes', hint: 'Upload a PDF students open quickly', accept: '.pdf,application/pdf', Icon: FileText },
  video: { label: 'Video', hint: 'Upload a lesson video (mp4)', accept: 'video/*,.mp4,.webm', Icon: PlayCircle },
  audio: { label: 'Audio', hint: 'Upload audio notes (mp3)', accept: 'audio/*,.mp3,.wav', Icon: Headphones },
  read: { label: 'Reading notes', hint: 'Write text notes students read in class', accept: '', Icon: FileText },
}

function moveItem<T>(list: T[], index: number, dir: number) {
  const next = index + dir
  if (next < 0 || next >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item)
  return copy
}

function newKey() {
  return `f${Math.random().toString(36).slice(2, 8)}`
}

function notesFromLesson(lesson: LessonDraft) {
  if (lesson.notes != null) return lesson.notes
  if (Array.isArray(lesson.body) && lesson.body.length) return lesson.body.join('\n\n')
  return ''
}

export function CourseLevels({
  courseId,
  role,
  onClose,
}: {
  courseId: string
  role: 'admin' | 'instructor'
  onClose: () => void
}) {
  const base = role === 'admin' ? `/admin/courses/${courseId}` : `/instructor/courses/${courseId}`
  const [title, setTitle] = useState('Course')
  const [levels, setLevels] = useState<LevelDraft[]>([])
  const [startGuide, setStartGuide] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api<{ course: { title: string; startGuide: string }; modules: LevelDraft[] }>(`${base}/content`)
      .then((payload) => {
        setTitle(payload.course.title)
        setStartGuide(payload.course.startGuide || '')
        const mods: LevelDraft[] = payload.modules.length
          ? payload.modules.map((m) => ({
              ...m,
              lessons: (m.lessons || []).map((l) => ({
                ...l,
                type: (['read', 'pdf', 'video', 'audio'].includes(l.type) ? l.type : 'read') as LessonType,
                notes: notesFromLesson(l),
              })),
            }))
          : [{
              id: 'm1',
              title: 'Level 1 — Getting started',
              lessons: [{ key: newKey(), title: 'Welcome notes', type: 'read' as const, notes: '', minutes: 6 }],
            }]
        setLevels(mods)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load course content.'))
      .finally(() => setLoading(false))
  }, [base])

  function patchLesson(levelIndex: number, lessonIndex: number, patch: Partial<LessonDraft>) {
    setLevels((current) => current.map((level, i) => {
      if (i !== levelIndex) return level
      return {
        ...level,
        lessons: level.lessons.map((lesson, j) => (j === lessonIndex ? { ...lesson, ...patch } : lesson)),
      }
    }))
  }

  async function onUpload(levelIndex: number, lessonIndex: number, file: File | undefined, kind: LessonType) {
    if (!file || kind === 'read') return
    const lesson = levels[levelIndex]?.lessons[lessonIndex]
    if (!lesson) return
    setUploading(lesson.key)
    setError(null)
    try {
      const result = await uploadFile<{ file: { id: string; name: string; kind: string } }>(`${base}/files`, file, { kind })
      patchLesson(levelIndex, lessonIndex, {
        fileId: result.file.id,
        fileName: result.file.name,
        type: (result.file.kind as LessonType) || kind,
      })
      setNotice(`Uploaded “${result.file.name}”.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading('')
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await api(`${base}/content`, {
        method: 'PUT',
        body: {
          startGuide,
          modules: levels.map((level) => ({
            ...level,
            lessons: level.lessons
              .filter((lesson) => lesson.title.trim())
              .map((lesson) => ({
                ...lesson,
                notes: lesson.type === 'read' ? (lesson.notes || '') : undefined,
                body: lesson.type === 'read'
                  ? (lesson.notes || '').split(/\n+/).map((line) => line.trim()).filter(Boolean)
                  : undefined,
              })),
          })),
        },
      })
      setNotice('Course content saved. Students will see these levels in order.')
      setTimeout(() => onClose(), 700)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save content.')
    } finally {
      setBusy(false)
    }
  }

  function addLesson(levelIndex: number, type: LessonType = 'pdf') {
    setLevels((current) => current.map((item, i) => i === levelIndex ? {
      ...item,
      lessons: [...item.lessons, {
        key: newKey(),
        title: type === 'pdf' ? 'New PDF notes' : type === 'read' ? 'New reading notes' : type === 'video' ? 'New video lesson' : 'New audio lesson',
        type,
        notes: '',
        minutes: type === 'pdf' ? 10 : type === 'video' ? 5 : type === 'audio' ? 4 : 6,
      }],
    } : item))
  }

  const lessonCount = levels.reduce((sum, level) => sum + level.lessons.length, 0)

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal modal-gfg levels-modal inst-content-modal" onSubmit={save}>
        <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>

        <div className="inst-content-hero">
          <span className="inst-content-badge"><Layers size={16} /> Content studio</span>
          <h2>{title}</h2>
          <p>
            Build levels students complete in order. Add PDF notes, videos, audio, or reading notes — then save.
            Students unlock the next level only after finishing the current one.
          </p>
          <div className="inst-content-stats">
            <span><strong>{levels.length}</strong> levels</span>
            <span><strong>{lessonCount}</strong> lessons</span>
          </div>
        </div>

        {loading && <p className="lede">Loading course content…</p>}
        {error && <p className="lvl-error">{error}</p>}
        {notice && <p className="lvl-ok"><CheckCircle2 size={14} /> {notice}</p>}

        {!loading && (
          <>
            <label className="lvl-guide">
              Welcome message (shown when students start)
              <textarea
                value={startGuide}
                onChange={(e) => setStartGuide(e.target.value)}
                placeholder="Start at Level 1. Finish each lesson, then unlock the next level until you earn your certificate."
              />
            </label>

            <div className="lvl-list">
              {levels.map((level, levelIndex) => (
                <section key={level.id} className="lvl-card inst-level-card">
                  <div className="lvl-card-top">
                    <span className="stu-level-badge">Level {levelIndex + 1}</span>
                    <input
                      value={level.title}
                      onChange={(e) => setLevels((current) => current.map((item, i) => i === levelIndex ? { ...item, title: e.target.value } : item))}
                      aria-label={`Level ${levelIndex + 1} title`}
                      placeholder="Level title"
                    />
                    <button type="button" aria-label="Move level up" onClick={() => setLevels((current) => moveItem(current, levelIndex, -1))}><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Move level down" onClick={() => setLevels((current) => moveItem(current, levelIndex, 1))}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      aria-label="Remove level"
                      onClick={() => setLevels((current) => current.filter((_, i) => i !== levelIndex))}
                      disabled={levels.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {level.lessons.map((lesson, lessonIndex) => {
                    const meta = TYPE_META[lesson.type]
                    const Icon = meta.Icon
                    return (
                      <div key={lesson.key} className={`inst-lesson-card type-${lesson.type}`}>
                        <div className="inst-lesson-top">
                          <span className={`inst-type-pill ${lesson.type}`}><Icon size={13} /> {meta.label}</span>
                          <input
                            value={lesson.title}
                            placeholder="Lesson title students will see"
                            onChange={(e) => patchLesson(levelIndex, lessonIndex, { title: e.target.value })}
                          />
                          <select
                            value={lesson.type}
                            onChange={(e) => patchLesson(levelIndex, lessonIndex, {
                              type: e.target.value as LessonType,
                              fileId: '',
                              fileName: '',
                            })}
                          >
                            <option value="pdf">PDF notes</option>
                            <option value="video">Video</option>
                            <option value="audio">Audio</option>
                            <option value="read">Reading notes</option>
                          </select>
                          <button type="button" aria-label="Move lesson up" onClick={() => setLevels((current) => current.map((item, i) => i === levelIndex ? { ...item, lessons: moveItem(item.lessons, lessonIndex, -1) } : item))}><ArrowUp size={14} /></button>
                          <button type="button" aria-label="Remove lesson" onClick={() => setLevels((current) => current.map((item, i) => i === levelIndex ? { ...item, lessons: item.lessons.filter((_, j) => j !== lessonIndex) } : item))}><Trash2 size={14} /></button>
                        </div>

                        <p className="inst-lesson-hint">{meta.hint}</p>

                        {lesson.type === 'read' ? (
                          <textarea
                            className="inst-notes-area"
                            value={lesson.notes || ''}
                            placeholder="Write clear reading notes here. Students see this instantly in the classroom."
                            onChange={(e) => patchLesson(levelIndex, lessonIndex, { notes: e.target.value })}
                          />
                        ) : (
                          <div className="inst-upload-row">
                            <label className={`lvl-file inst-upload${lesson.fileId ? ' has-file' : ''}`}>
                              {uploading === lesson.key ? (
                                <>Uploading…</>
                              ) : lesson.fileName ? (
                                <><CheckCircle2 size={14} /> {lesson.fileName}</>
                              ) : (
                                <><Upload size={14} /> Choose {lesson.type} file</>
                              )}
                              <input
                                type="file"
                                accept={meta.accept}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  e.target.value = ''
                                  void onUpload(levelIndex, lessonIndex, file, lesson.type)
                                }}
                              />
                            </label>
                            {lesson.fileId && <span className="inst-file-ready">Attached · students can open this</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div className="inst-add-row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLesson(levelIndex, 'pdf')}>
                      <Plus size={14} /> PDF notes
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLesson(levelIndex, 'video')}>
                      <Plus size={14} /> Video
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLesson(levelIndex, 'audio')}>
                      <Plus size={14} /> Audio
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLesson(levelIndex, 'read')}>
                      <Plus size={14} /> Reading notes
                    </button>
                  </div>
                </section>
              ))}
            </div>

            <div className="lvl-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLevels((current) => [...current, {
                  id: `m${Date.now().toString(36)}`,
                  title: `Level ${current.length + 1}`,
                  lessons: [],
                }])}
              >
                <Plus size={14} /> Add level
              </button>
              <button type="submit" className="btn btn-green" disabled={busy}>
                {busy ? 'Saving…' : 'Save course content'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
