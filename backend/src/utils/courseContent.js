import { parseJson } from './map.js'
import { pool } from '../db/pool.js'

function lessonKey(value, index) {
  const raw = String(value || `l${index + 1}`).slice(0, 40)
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '')
  return safe || `l${index + 1}`
}

export function modulesForEditor(course) {
  const modules = parseJson(course.modules, [])
  return modules.map((mod, mi) => ({
    id: String(mod.id || `m${mi + 1}`),
    title: mod.title || `Level ${mi + 1}`,
    lessons: (Array.isArray(mod.lessons) ? mod.lessons : []).map((lesson, index) => {
      if (typeof lesson === 'string') {
        return {
          key: `l${index + 1}`,
          title: lesson,
          type: 'read',
          fileId: '',
          fileName: '',
          mediaUrl: '',
          body: [],
          minutes: 6,
        }
      }
      const type = ['read', 'video', 'audio', 'pdf'].includes(lesson.type) ? lesson.type : 'read'
      return {
        key: lesson.key || `l${index + 1}`,
        title: lesson.title || `Lesson ${index + 1}`,
        type,
        fileId: lesson.fileId || '',
        fileName: lesson.fileName || '',
        mediaUrl: lesson.mediaUrl || lesson.url || '',
        body: Array.isArray(lesson.body) ? lesson.body : (lesson.notes ? String(lesson.notes).split(/\n+/).filter(Boolean) : []),
        minutes: Number(lesson.minutes || (type === 'pdf' ? 10 : type === 'video' ? 4 : type === 'audio' ? 3 : 6)),
      }
    }),
  }))
}

function sanitizeModules(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 40).map((mod, mi) => {
    const id = lessonKey(mod?.id, mi).slice(0, 40)
    const title = String(mod?.title || `Level ${mi + 1}`).trim().slice(0, 160) || `Level ${mi + 1}`
    const lessons = (Array.isArray(mod?.lessons) ? mod.lessons : []).slice(0, 40).map((lesson, index) => {
      if (typeof lesson === 'string') return lesson.slice(0, 180)
      const type = ['read', 'video', 'audio', 'pdf'].includes(lesson?.type) ? lesson.type : 'read'
      const item = {
        key: lessonKey(lesson?.key, index),
        title: String(lesson?.title || `Lesson ${index + 1}`).trim().slice(0, 180) || `Lesson ${index + 1}`,
        type,
        minutes: Math.min(240, Math.max(1, Number(lesson?.minutes || (type === 'pdf' ? 10 : 6)))),
      }
      if (lesson?.fileId) item.fileId = String(lesson.fileId).slice(0, 64)
      if (lesson?.fileName) item.fileName = String(lesson.fileName).slice(0, 180)
      if (lesson?.mediaUrl && !lesson?.fileId) item.mediaUrl = String(lesson.mediaUrl).slice(0, 500)
      const notes = String(lesson?.notes || '').trim()
      const body = Array.isArray(lesson?.body)
        ? lesson.body.map((line) => String(line).trim()).filter(Boolean).slice(0, 40)
        : notes
          ? notes.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 40)
          : []
      if (body.length) item.body = body.map((line) => line.slice(0, 1200))
      return item
    }).filter((lesson) => typeof lesson === 'string' || lesson.title)
    return { id: id || `m${mi + 1}`, title, lessons }
  })
}

export async function saveCourseContent(course, body) {
  const modules = sanitizeModules(body?.modules)
  const fileIds = []
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      if (lesson && typeof lesson === 'object' && lesson.fileId) fileIds.push(lesson.fileId)
      if (lesson && typeof lesson === 'object' && lesson.type === 'pdf' && !lesson.fileId) {
        const error = new Error(`Upload a PDF notes file for “${lesson.title}”.`)
        error.status = 400
        throw error
      }
      if (lesson && typeof lesson === 'object' && (lesson.type === 'video' || lesson.type === 'audio') && !lesson.fileId && !lesson.mediaUrl) {
        const error = new Error(`Upload a ${lesson.type} file for “${lesson.title}”.`)
        error.status = 400
        throw error
      }
    }
  }
  if (fileIds.length) {
    const [rows] = await pool.query(
      `SELECT id, kind FROM course_files WHERE course_id = ? AND id IN (${fileIds.map(() => '?').join(',')})`,
      [course.id, ...fileIds],
    )
    const owned = new Map(rows.map((row) => [row.id, row.kind]))
    for (const mod of modules) {
      for (const lesson of mod.lessons) {
        if (!lesson?.fileId) continue
        if (!owned.has(lesson.fileId)) {
          const error = new Error('One of the files does not belong to this course.')
          error.status = 400
          throw error
        }
        const kind = owned.get(lesson.fileId)
        if (lesson.type === 'pdf' && kind !== 'pdf') {
          const error = new Error(`“${lesson.title}” needs a PDF file.`)
          error.status = 400
          throw error
        }
        if ((lesson.type === 'video' || lesson.type === 'audio') && kind !== lesson.type) {
          const error = new Error(`“${lesson.title}” needs a ${lesson.type} file.`)
          error.status = 400
          throw error
        }
      }
    }
  }
  const startGuide = String(body?.startGuide || '').trim().slice(0, 800)
  await pool.query(
    'UPDATE courses SET modules = ?, start_guide = ? WHERE id = ?',
    [JSON.stringify(modules), startGuide, course.id],
  )
  return { modules, startGuide }
}

export async function listCourseFiles(courseId) {
  const [rows] = await pool.query(
    `SELECT id, kind, original_name AS name, mime, size_bytes AS size, created_at AS createdAt
     FROM course_files WHERE course_id = ? ORDER BY created_at DESC`,
    [courseId],
  )
  return rows
}
