import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { absoluteFilePath, canReadCourseFile } from '../utils/uploads.js'

export const filesRouter = Router()

function tokenFrom(req) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7)
  if (typeof req.query.access_token === 'string') return req.query.access_token
  return ''
}

filesRouter.get('/:id', async (req, res) => {
  const token = tokenFrom(req)
  if (!token) return res.status(401).json({ message: 'Sign in required.' })
  let user
  try {
    user = jwt.verify(token, process.env.JWT_SECRET || 'geekpath-dev-secret')
  } catch {
    return res.status(401).json({ message: 'Session expired. Sign in again.' })
  }
  const [[file]] = await pool.query('SELECT * FROM course_files WHERE id = ?', [req.params.id])
  if (!file) return res.status(404).json({ message: 'File not found.' })
  if (!(await canReadCourseFile(user, file))) {
    return res.status(403).json({ message: 'You do not have access to this file.' })
  }
  const safeName = String(file.original_name || 'file').replace(/["\r\n]/g, '')
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
  res.sendFile(absoluteFilePath(file.stored_name), (error) => {
    if (error && !res.headersSent) res.status(404).json({ message: 'File missing on disk.' })
  })
})
