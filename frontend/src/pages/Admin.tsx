import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Award, BookOpen, Briefcase, Building2, Code2, FileText, LayoutDashboard,
  LogOut, Menu, Plus, Search, Settings, Trash2, Trophy, Users, X, Pencil,
  GraduationCap, Layers, ScrollText,
} from 'lucide-react'
import { api } from '../api/client'
import { CourseLevels } from '../components/CourseLevels'
import { useApp } from '../context/AppContext'

type Tab =
  | 'overview' | 'users' | 'courses' | 'articles' | 'problems'
  | 'jobs' | 'contests' | 'enrollments' | 'certificates'

type Stats = {
  users: number; students: number; instructors: number; courses: number
  problems: number; articles: number; submissions: number; jobs: number
  enrollments: number; certificates: number; contests: number
  recentUsers?: { id: string; name: string; email: string; role: string }[]
  recentEnrollments?: { user_name: string; course_title: string; progress: number; payment_status: string }[]
}

const nav: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'users', label: 'Users', icon: <Users size={18} /> },
  { id: 'courses', label: 'Courses', icon: <BookOpen size={18} /> },
  { id: 'articles', label: 'Articles', icon: <FileText size={18} /> },
  { id: 'problems', label: 'Problems', icon: <Code2 size={18} /> },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase size={18} /> },
  { id: 'contests', label: 'Contests', icon: <Trophy size={18} /> },
  { id: 'enrollments', label: 'Enrollments', icon: <GraduationCap size={18} /> },
  { id: 'certificates', label: 'Certificates', icon: <Award size={18} /> },
]

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'A'
}

export function Admin() {
  const { user, logout, openAuth } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 860 : true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [contentCourse, setContentCourse] = useState<{ id: string; title: string } | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [instructors, setInstructors] = useState<{ id: string; name: string; email: string }[]>([])

  async function loadStats() {
    const data = await api<Stats>('/admin/stats')
    setStats(data)
  }

  async function loadInstructors() {
    try {
      const data = await api<{ instructors: { id: string; name: string; email: string }[] }>('/admin/instructors')
      setInstructors(data.instructors || [])
    } catch {
      setInstructors([])
    }
  }

  async function loadTab(next: Tab = tab) {
    setError(null)
    try {
      if (next === 'overview') {
        await loadStats()
        setRows([])
        return
      }
      const map: Record<string, string> = {
        users: '/admin/users',
        courses: '/admin/courses',
        articles: '/admin/articles',
        problems: '/admin/problems',
        jobs: '/admin/jobs',
        contests: '/admin/contests',
        enrollments: '/admin/enrollments',
        certificates: '/admin/certificates',
      }
      const path = map[next]
      if (!path) return
      const data = await api<any>(path)
      const key = Object.keys(data).find((k) => Array.isArray(data[k])) || next
      setRows(data[key] || [])
      await loadStats().catch(() => undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data.')
    }
  }

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    loadTab(tab)
    if (tab === 'courses') loadInstructors()
  }, [user, tab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
  }, [rows, query])

  function openCreate() {
    setEditing(null)
    setForm({})
    setModal('create')
  }

  function openEdit(row: any) {
    setEditing(row)
    const next: Record<string, string> = {}
    Object.entries(row).forEach(([k, v]) => {
      if (v == null || typeof v === 'object') return
      next[k] = String(v)
    })
    setForm(next)
    setModal('edit')
  }

  async function saveForm(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (tab === 'users') {
        const body = {
          name: form.name, email: form.email, role: form.role || 'student',
          password: form.password, emailVerified: form.emailVerified !== '0',
        }
        if (modal === 'create') await api('/admin/users', { method: 'POST', body })
        else await api(`/admin/users/${editing.id}`, { method: 'PUT', body })
      } else if (tab === 'courses') {
        const body = {
          title: form.title, slug: form.slug, subtitle: form.subtitle, level: form.level,
          price: form.price, oldPrice: form.old_price, seats: form.seats, weeks: form.weeks,
          tag: form.tag, description: form.description, live: form.live !== '0',
          instructorId: form.instructor_id || null,
        }
        if (modal === 'create') await api('/admin/courses', { method: 'POST', body })
        else await api(`/admin/courses/${editing.id}`, { method: 'PUT', body })
      } else if (tab === 'articles') {
        const body = {
          title: form.title, slug: form.slug, category: form.category,
          difficulty: form.difficulty, minutes: form.minutes, excerpt: form.excerpt,
        }
        if (modal === 'create') await api('/admin/articles', { method: 'POST', body })
        else await api(`/admin/articles/${editing.slug}`, { method: 'PUT', body })
      } else if (tab === 'problems') {
        const body = {
          title: form.title, difficulty: form.difficulty, topic: form.topic, prompt: form.prompt,
        }
        if (modal === 'create') await api('/admin/problems', { method: 'POST', body })
        else await api(`/admin/problems/${editing.id}`, { method: 'PUT', body })
      } else if (tab === 'jobs') {
        const body = {
          title: form.title, company: form.company, location: form.location,
          type: form.type, level: form.level, salary: form.salary, remote: form.remote === '1',
        }
        if (modal === 'create') await api('/admin/jobs', { method: 'POST', body })
        else await api(`/admin/jobs/${editing.id}`, { method: 'PUT', body })
      } else if (tab === 'contests') {
        const body = {
          title: form.title, starts: form.starts, duration: form.duration,
          problems: form.problems, registered: form.registered, status: form.status,
        }
        if (modal === 'create') await api('/admin/contests', { method: 'POST', body })
        else await api(`/admin/contests/${editing.id}`, { method: 'PUT', body })
      }
      setNotice(modal === 'create' ? 'Created successfully.' : 'Updated successfully.')
      setModal(null)
      await loadTab(tab)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function removeRow(row: any) {
    if (!window.confirm('Delete this record permanently?')) return
    setBusy(true)
    try {
      if (tab === 'users') await api(`/admin/users/${row.id}`, { method: 'DELETE' })
      if (tab === 'courses') await api(`/admin/courses/${row.id}`, { method: 'DELETE' })
      if (tab === 'articles') await api(`/admin/articles/${row.slug}`, { method: 'DELETE' })
      if (tab === 'problems') await api(`/admin/problems/${row.id}`, { method: 'DELETE' })
      if (tab === 'jobs') await api(`/admin/jobs/${row.id}`, { method: 'DELETE' })
      if (tab === 'contests') await api(`/admin/contests/${row.id}`, { method: 'DELETE' })
      if (tab === 'enrollments') await api(`/admin/enrollments/${row.user_id}/${row.course_id}`, { method: 'DELETE' })
      setNotice('Deleted.')
      await loadTab(tab)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="panel-gate">
        <div className="panel-gate-card">
          <Settings size={40} />
          <h1>Admin Console</h1>
          <p>Sign in with an admin account to manage the platform.</p>
          <button className="btn btn-green" onClick={() => openAuth('login')}>Sign In</button>
        </div>
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="panel-gate">
        <div className="panel-gate-card">
          <Building2 size={40} />
          <h1>Admin only</h1>
          <p>Use <code>admin@geekpath.dev</code> / <code>admin123</code></p>
          <Link className="btn btn-green" to="/dashboard">Go to Dashboard</Link>
        </div>
      </div>
    )
  }

  const canCrud = ['users', 'courses', 'articles', 'problems', 'jobs', 'contests'].includes(tab)

  return (
    <div className={`panel-shell ${sidebarOpen ? '' : 'panel-collapsed'}`}>
      <aside className="panel-side">
        <div className="panel-brand">
          <span className="panel-logo">GFG</span>
          <div>
            <strong>GeekPath</strong>
            <small>Admin Manager</small>
          </div>
        </div>
        <nav className="panel-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`panel-nav-item${tab === item.id ? ' on' : ''}`}
              onClick={() => { setTab(item.id); setQuery(''); setNotice(null) }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="panel-side-foot">
          <Link to="/" className="panel-nav-item"><Layers size={18} /> Site Home</Link>
          <button type="button" className="panel-nav-item" onClick={() => { logout(); navigate('/') }}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <div className="panel-main">
        <header className="panel-top">
          <button type="button" className="panel-icon-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
            <Menu size={18} />
          </button>
          <div className="panel-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'overview' ? 'Search platform…' : `Search ${tab}…`}
            />
          </div>
          <div className="panel-userchip">
            <span className="panel-avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Administrator</small>
            </div>
          </div>
        </header>

        <div className="panel-body">
          {(notice || error) && (
            <div className={`panel-banner ${error ? 'err' : 'ok'}`}>
              <span>{error || notice}</span>
              <button type="button" onClick={() => { setNotice(null); setError(null) }}><X size={14} /></button>
            </div>
          )}

          {tab === 'overview' && stats && (
            <>
              <div className="panel-head-row">
                <div>
                  <p className="eyebrow">Overview</p>
                  <h1>Platform Dashboard</h1>
                </div>
              </div>
              <div className="panel-kpi-grid">
                {[
                  { label: 'Users', value: stats.users, icon: <Users size={18} />, tone: 'a' },
                  { label: 'Students', value: stats.students, icon: <GraduationCap size={18} />, tone: 'b' },
                  { label: 'Instructors', value: stats.instructors, icon: <ScrollText size={18} />, tone: 'c' },
                  { label: 'Courses', value: stats.courses, icon: <BookOpen size={18} />, tone: 'd' },
                  { label: 'Enrollments', value: stats.enrollments, icon: <Layers size={18} />, tone: 'a' },
                  { label: 'Certificates', value: stats.certificates, icon: <Award size={18} />, tone: 'b' },
                  { label: 'Problems', value: stats.problems, icon: <Code2 size={18} />, tone: 'c' },
                  { label: 'Articles', value: stats.articles, icon: <FileText size={18} />, tone: 'd' },
                ].map((card) => (
                  <article key={card.label} className={`panel-kpi tone-${card.tone}`}>
                    <span>{card.icon}</span>
                    <b>{card.value}</b>
                    <small>{card.label}</small>
                  </article>
                ))}
              </div>

              <div className="panel-split">
                <section className="panel-card">
                  <div className="panel-card-head">
                    <h3>Recent Users</h3>
                    <button type="button" className="btn btn-sm panel-purple" onClick={() => setTab('users')}>View All</button>
                  </div>
                  <table className="panel-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
                    <tbody>
                      {(stats.recentUsers || []).map((u) => (
                        <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><span className="panel-pill">{u.role}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="panel-card">
                  <div className="panel-card-head">
                    <h3>Recent Enrollments</h3>
                    <button type="button" className="btn btn-sm panel-purple" onClick={() => setTab('enrollments')}>View All</button>
                  </div>
                  <table className="panel-table">
                    <thead><tr><th>Student</th><th>Course</th><th>Progress</th></tr></thead>
                    <tbody>
                      {(stats.recentEnrollments || []).map((e, i) => (
                        <tr key={`${e.user_name}-${e.course_title}-${i}`}>
                          <td>{e.user_name || '—'}</td>
                          <td>{e.course_title || '—'}</td>
                          <td>{Number(e.progress || 0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </>
          )}

          {tab !== 'overview' && (
            <>
              <div className="panel-head-row">
                <div>
                  <p className="eyebrow">CRUD Manager</p>
                  <h1>{nav.find((n) => n.id === tab)?.label}</h1>
                </div>
                {canCrud && (
                  <button type="button" className="btn panel-purple" onClick={openCreate}>
                    <Plus size={16} /> Add {nav.find((n) => n.id === tab)?.label.slice(0, -1) || 'Item'}
                  </button>
                )}
              </div>

              <section className="panel-card">
                <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead>
                    <tr>
                      {tab === 'users' && (<><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th /></>)}
                      {tab === 'courses' && (<><th>Title</th><th>Level</th><th>Instructor</th><th>Price</th><th /></>)}
                      {tab === 'articles' && (<><th>Title</th><th>Category</th><th>Difficulty</th><th>Minutes</th><th /></>)}
                      {tab === 'problems' && (<><th>Title</th><th>Difficulty</th><th>Topic</th><th /></>)}
                      {tab === 'jobs' && (<><th>Title</th><th>Company</th><th>Location</th><th>Type</th><th /></>)}
                      {tab === 'contests' && (<><th>Title</th><th>Status</th><th>Starts</th><th>Problems</th><th /></>)}
                      {tab === 'enrollments' && (<><th>Student</th><th>Course</th><th>Progress</th><th>Payment</th><th /></>)}
                      {tab === 'certificates' && (<><th>ID</th><th>Student</th><th>Course</th><th>Issued</th></>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id || row.slug || `${row.user_id}-${row.course_id}`}>
                        {tab === 'users' && (
                          <>
                            <td>{row.name}</td><td>{row.email}</td>
                            <td><span className="panel-pill">{row.role}</span></td>
                            <td>{row.emailVerified ? 'Yes' : 'No'}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'courses' && (
                          <>
                            <td>{row.title}</td><td>{row.level}</td>
                            <td>{row.instructor_name || <span className="muted">Unassigned</span>}</td>
                            <td>{row.price}</td>
                            <td className="panel-actions">
                              <button type="button" title="Arrange levels and files" onClick={() => setContentCourse({ id: row.id, title: row.title })}><Layers size={14} /></button>
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'articles' && (
                          <>
                            <td>{row.title}</td><td>{row.category}</td><td>{row.difficulty}</td><td>{row.minutes}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'problems' && (
                          <>
                            <td>{row.title}</td><td>{row.difficulty}</td><td>{row.topic}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'jobs' && (
                          <>
                            <td>{row.title}</td><td>{row.company}</td><td>{row.location}</td><td>{row.type}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'contests' && (
                          <>
                            <td>{row.title}</td><td><span className="panel-pill">{row.status}</span></td>
                            <td>{row.starts}</td><td>{row.problems}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'enrollments' && (
                          <>
                            <td>{row.user_name}<div className="muted">{row.user_email}</div></td>
                            <td>{row.course_title || row.course_id}</td>
                            <td>{Number(row.progress || 0)}%</td>
                            <td>{row.payment_status || '—'}</td>
                            <td className="panel-actions">
                              <button type="button" onClick={() => removeRow(row)}><Trash2 size={14} /></button>
                            </td>
                          </>
                        )}
                        {tab === 'certificates' && (
                          <>
                            <td><code>{row.id}</code></td>
                            <td>{row.student_name}</td>
                            <td>{row.course_title}</td>
                            <td>{row.issued_at}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="panel-empty">No records found.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {modal && (
        <div className="overlay" role="dialog" aria-modal="true">
          <form className="modal modal-gfg panel-modal" onSubmit={saveForm}>
            <button type="button" className="icon-btn modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={16} /></button>
            <h2>{modal === 'create' ? 'Create' : 'Edit'} {nav.find((n) => n.id === tab)?.label.slice(0, -1)}</h2>
            <div className="panel-form-grid">
              {tab === 'users' && (
                <>
                  <label>Name<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label>Email<input required type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                  <label>Role
                    <select value={form.role || 'student'} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="student">student</option>
                      <option value="instructor">instructor</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label>Password{modal === 'create' ? '' : ' (optional)'}
                    <input type="password" required={modal === 'create'} value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </label>
                </>
              )}
              {tab === 'courses' && (
                <>
                  <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                  <label>Slug<input value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
                  <label>Level<input value={form.level || ''} onChange={(e) => setForm({ ...form, level: e.target.value })} /></label>
                  <label>Price<input value={form.price || ''} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
                  <label>Weeks<input value={form.weeks || ''} onChange={(e) => setForm({ ...form, weeks: e.target.value })} /></label>
                  <label>Seats<input value={form.seats || ''} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></label>
                  <label className="full">Assign instructor
                    <select
                      value={form.instructor_id || ''}
                      onChange={(e) => setForm({ ...form, instructor_id: e.target.value })}
                    >
                      <option value="">— Unassigned —</option>
                      {instructors.map((inst) => (
                        <option key={inst.id} value={inst.id}>{inst.name} ({inst.email})</option>
                      ))}
                    </select>
                  </label>
                  <label className="full">Description<textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                </>
              )}
              {tab === 'articles' && (
                <>
                  <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                  <label>Slug<input value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></label>
                  <label>Category<input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
                  <label>Difficulty<input value={form.difficulty || ''} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} /></label>
                  <label className="full">Excerpt<textarea value={form.excerpt || ''} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></label>
                </>
              )}
              {tab === 'problems' && (
                <>
                  <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                  <label>Difficulty
                    <select value={form.difficulty || 'Easy'} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                      <option>Easy</option><option>Medium</option><option>Hard</option>
                    </select>
                  </label>
                  <label>Topic<input value={form.topic || ''} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></label>
                  <label className="full">Prompt<textarea value={form.prompt || ''} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></label>
                </>
              )}
              {tab === 'jobs' && (
                <>
                  <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                  <label>Company<input value={form.company || ''} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
                  <label>Location<input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
                  <label>Type<input value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })} /></label>
                  <label>Salary<input value={form.salary || ''} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></label>
                </>
              )}
              {tab === 'contests' && (
                <>
                  <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                  <label>Status
                    <select value={form.status || 'Upcoming'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option>Live</option><option>Upcoming</option><option>Past</option>
                    </select>
                  </label>
                  <label>Starts<input value={form.starts || ''} onChange={(e) => setForm({ ...form, starts: e.target.value })} /></label>
                  <label>Duration<input value={form.duration || ''} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></label>
                  <label>Problems<input value={form.problems || ''} onChange={(e) => setForm({ ...form, problems: e.target.value })} /></label>
                </>
              )}
            </div>
            <button type="submit" className="btn panel-purple btn-wide" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </form>
        </div>
      )}
      {contentCourse && (
        <CourseLevels courseId={contentCourse.id} role="admin" onClose={() => setContentCourse(null)} />
      )}
    </div>
  )
}
