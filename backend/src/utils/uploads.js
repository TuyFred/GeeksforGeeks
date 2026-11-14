import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { pool } from '../db/pool.js'

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', 'ts', 'm2ts'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus', 'wma', 'aiff', 'aif', 'weba', 'm4b'])

const MIME = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'audio/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/mp4',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  '3gp': 'video/3gpp',
  ts: 'video/mp2t',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  opus: 'audio/opus',
  wma: 'audio/x-ms-wma',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  weba: 'audio/webm',
  m4b: 'audio/mp4',
}

export function extOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return match ? match[1] : ''
}

export function classify(ext, mime, requested) {
  const kind = String(requested || '')
  if (kind === 'pdf' || ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (kind === 'video' || VIDEO_EXT.has(ext) || String(mime).startsWith('video/')) return 'video'
  if (kind === 'audio' || AUDIO_EXT.has(ext) || String(mime).startsWith('audio/')) return 'audio'
  return ''
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = extOf(file.originalname)
    cb(null, `${randomUUID()}${ext ? `.${ext}` : ''}`)
  },
})

const uploader = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
}).single('file')

export function uploadMiddleware(req, res, next) {
  uploader(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum size is 120 MB.' })
    }
    return res.status(400).json({ message: error.message || 'Could not upload that file.' })
  })
}

export async function assertCanEditCourse(user, courseId) {
  const [[course]] = await pool.query('SELECT * FROM courses WHERE id = ? OR slug = ?', [courseId, courseId])
  if (!course) {
    const error = new Error('Course not found.')
    error.status = 404
    throw error
  }
  if (user.role === 'admin') return course
  if (user.role === 'instructor' && course.instructor_id === user.id) return course
  const error = new Error('You can only add files to your own courses.')
  error.status = 403
  throw error
}

export async function saveUploadedFile(user, course, file, requestedKind) {
  if (!file) {
    const error = new Error('Choose a file to upload.')
    error.status = 400
    throw error
  }
  const ext = extOf(file.originalname)
  const requested = String(requestedKind || '')
  let kind = classify(ext, file.mimetype, requested)
  if ((requested === 'video' || requested === 'audio') && ext && kind !== 'pdf') kind = requested
  if (requested === 'pdf' && kind !== 'pdf') {
    fs.unlink(file.path, () => undefined)
    const error = new Error('Reading documents must be PDF files.')
    error.status = 400
    throw error
  }
  if (!kind || (kind === 'pdf' && ext !== 'pdf' && file.mimetype !== 'application/pdf')) {
    fs.unlink(file.path, () => undefined)
    const error = new Error('Upload a PDF, or an audio or video file.')
    error.status = 400
    throw error
  }
  const id = randomUUID()
  const mime = MIME[ext] || file.mimetype || (kind === 'pdf' ? 'application/pdf' : kind === 'video' ? 'video/mp4' : 'audio/mpeg')
  const original = path.basename(file.originalname || 'file').replace(/[^\w.\- ()]+/g, '_').slice(0, 180) || 'file'
  await pool.query(
    `INSERT INTO course_files (id, course_id, kind, original_name, stored_name, mime, ext, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, course.id, kind, original, file.filename, mime.slice(0, 120), ext.slice(0, 20), file.size || 0, user.id],
  )
  return { id, kind, name: original, mime, size: file.size || 0 }
}

export function absoluteFilePath(storedName) {
  return path.join(uploadDir, path.basename(storedName))
}

export async function canReadCourseFile(user, fileRow) {
  if (!user) return false
  if (user.role === 'admin') return true
  const [[course]] = await pool.query('SELECT instructor_id FROM courses WHERE id = ?', [fileRow.course_id])
  if (user.role === 'instructor' && course?.instructor_id === user.id) return true
  const [[enrollment]] = await pool.query(
    'SELECT payment_status FROM enrollments WHERE user_id = ? AND course_id = ?',
    [user.id, fileRow.course_id],
  )
  return enrollment?.payment_status === 'paid'
}
