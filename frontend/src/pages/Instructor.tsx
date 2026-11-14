import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Award, BookOpen, ChevronRight, GraduationCap, Layers, LayoutDashboard,
  LogOut, Menu, Pencil, Search, Users, X,
} from 'lucide-react'
import { api } from '../api/client'
import { CourseLevels } from '../components/CourseLevels'
import { useApp } from '../context/AppContext'

type Dash = {
  stats: { courses: number; students: number; enrollments: number; completed: number; certificates: number }
  courses: any[]
  recentStudents: any[]
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'I'
}

export function Instructor() {
  const { user, logout, openAuth } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'overview' | 'courses' | 'students'>('overview')
  const [data, setData] = useState<Dash | null>(null)
  const [courses, setCourses] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 860 : true)
  const [edit, setEdit] = useState<any>(null)
  const [contentCourse, setContentCourse] = useState<{ id: string; title: string } | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const dash = await api<Dash>('/instructor/dashboard')
    setData(dash)
    if (tab === 'courses') {
      const c = await api<{ courses: any[] }>('/instructor/courses')
      setCourses(c.courses)
    }
    if (tab === 'students') {
      const s = await api<{ students: any[] }>('/instructor/students')
      setStudents(s.students)
    }
  }

  useEffect(() => {
    if (!user || (user.role !== 'instructor' && user.role !== 'admin')) return
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [user, tab])

  async function saveCourse(e: FormEvent) {
    e.preventDefault()
    try {
      await api(`/instructor/courses/${edit.id}`, {
        method: 'PUT',
        body: {
          title: form.title,
          subtitle: form.subtitle,
          level: form.level,
          price: form.price,
          seats: form.seats,
          weeks: form.weeks,
          description: form.description,
          live: form.live !== '0',
        },
      })
      setNotice('Course updated.')
      setEdit(null)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  if (!user) {
    return (
      <div className="panel-gate">
        <div className="panel-gate-card">
          <GraduationCap size={40} />
          <h1>Instructor Workspace</h1>
          <p>Sign in as instructor to manage courses and students.</p>
          <button className="btn btn-green" onClick={() => openAuth('login')}>Sign In</button>
        </div>
      </div>
    )
  }

  if (user.role !== 'instructor' && user.role !== 'admin') {
    return (
      <div className="panel-gate">
        <div className="panel-gate-card">
          <Users size={40} />
          <h1>Instructor access only</h1>
          <p>Use <code>instructor@geekpath.dev</code> / <code>teach123</code></p>
          <Link className="btn btn-green" to="/dashboard">Student Dashboard</Link>
        </div>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const courseRows = (tab === 'courses' ? courses : data?.courses || []).filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q))
  const studentRows = students.filter((s) => !q || JSON.stringify(s).toLowerCase().includes(q))

  return (
    <div className={`panel-shell instructor-shell ${sidebarOpen ? '' : 'panel-collapsed'}`}>
      <aside className="panel-side">
        <div className="panel-brand">
          <span className="panel-logo teal">IN</span>
          <div>
            <strong>Instructor</strong>
            <small>Teaching Hub</small>
          </div>
        </div>
        <nav className="panel-nav">
          <button type="button" className={`panel-nav-item${tab === 'overview' ? ' on' : ''}`} onClick={() => setTab('overview')}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button type="button" className={`panel-nav-item${tab === 'courses' ? ' on' : ''}`} onClick={() => setTab('courses')}>
            <BookOpen size={18} /> My Courses
          </button>
          <button type="button" className={`panel-nav-item${tab === 'students' ? ' on' : ''}`} onClick={() => setTab('students')}>
            <Users size={18} /> Students
          </button>
        </nav>
        <div className="panel-side-foot">
          <Link to="/courses" className="panel-nav-item">Browse Catalogue</Link>
          <button type="button" className="panel-nav-item" onClick={() => { logout(); navigate('/') }}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <div className="panel-main">
        <header className="panel-top">
          <button type="button" className="panel-icon-btn" onClick={() => setSidebarOpen((v) => !v)}><Menu size={18} /></button>
          <div className="panel-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses or students…" />
          </div>
          <div className="panel-userchip">
            <span className="panel-avatar teal">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>Instructor</small>
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

          {tab === 'overview' && data && (
            <>
              <div className="panel-head-row">
                <div>
                  <p className="eyebrow">Teaching overview</p>
                  <h1>Welcome, {user.name.split(' ')[0]}</h1>
                </div>
                <Link className="btn btn-green" to="/courses">Open Catalogue <ChevronRight size={16} /></Link>
              </div>

              <div className="panel-kpi-grid five">
                {[
                  { label: 'Courses', value: data.stats.courses, icon: <BookOpen size={18} />, tone: 'a' },
                  { label: 'Students', value: data.stats.students, icon: <Users size={18} />, tone: 'b' },
                  { label: 'Enrollments', value: data.stats.enrollments, icon: <GraduationCap size={18} />, tone: 'c' },
                  { label: 'Completed', value: data.stats.completed, icon: <Award size={18} />, tone: 'd' },
                  { label: 'Certificates', value: data.stats.certificates, icon: <Award size={18} />, tone: 'a' },
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
                    <h3>Course performance</h3>
                    <button type="button" className="btn btn-sm panel-teal" onClick={() => setTab('courses')}>Manage</button>
                  </div>
                  <table className="panel-table">
                    <thead><tr><th>Course</th><th>Students</th><th>Avg progress</th><th>Mode</th></tr></thead>
                    <tbody>
                      {data.courses.map((c) => (
                        <tr key={c.id}>
                          <td>{c.title}</td>
                          <td>{c.students}</td>
                          <td>{Number(c.avg_progress || 0)}%</td>
                          <td>{Number(c.live) ? 'Live' : 'Self-paced'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="panel-card">
                  <div className="panel-card-head">
                    <h3>Recent learners</h3>
                    <button type="button" className="btn btn-sm panel-teal" onClick={() => setTab('students')}>View All</button>
                  </div>
                  <ul className="inst-student-list">
                    {data.recentStudents.map((s, i) => (
                      <li key={`${s.id}-${s.course_id}-${i}`}>
                        <span className="panel-avatar sm">{initials(s.name || 'S')}</span>
                        <div>
                          <strong>{s.name}</strong>
                          <small>{s.course_title} · {Number(s.progress || 0)}%</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          )}

          {tab === 'courses' && (
            <>
              <div className="panel-head-row">
                <div>
                  <p className="eyebrow">Content</p>
                  <h1>My Courses</h1>
                  <p className="stu-sub">Add PDF notes, videos, audio, and reading notes for each level.</p>
                </div>
              </div>
              <section className="panel-card">
                <table className="panel-table">
                  <thead><tr><th>Title</th><th>Level</th><th>Price</th><th>Students</th><th>Live</th><th>Actions</th></tr></thead>
                  <tbody>
                    {courseRows.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.title}</strong></td>
                        <td>{c.level}</td>
                        <td>{c.price}</td>
                        <td>{c.students}</td>
                        <td>{Number(c.live) ? 'Yes' : 'No'}</td>
                        <td className="panel-actions inst-course-actions">
                          <button
                            type="button"
                            className="btn btn-sm panel-teal"
                            title="Add levels, PDF notes, video & audio"
                            onClick={() => setContentCourse({ id: c.id, title: c.title })}
                          >
                            <Layers size={14} /> Add content
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEdit(c)
                              setForm({
                                title: c.title || '',
                                subtitle: c.subtitle || '',
                                level: c.level || '',
                                price: c.price || '',
                                seats: c.seats || '',
                                weeks: c.weeks || '',
                                description: c.description || '',
                                live: String(Number(c.live) ? 1 : 0),
                              })
                            }}
                          >
                            <Pencil size={14} /> Edit
                          </button>
                          <Link className="btn btn-ghost btn-sm" to={`/courses/${c.slug || c.id}`}>Preview</Link>
                        </td>
                      </tr>
                    ))}
                    {courseRows.length === 0 && (
                      <tr><td colSpan={6} className="panel-empty">No courses assigned yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {tab === 'students' && (
            <>
              <div className="panel-head-row">
                <div>
                  <p className="eyebrow">Learners</p>
                  <h1>Students</h1>
                </div>
              </div>
              <section className="panel-card">
                <table className="panel-table">
                  <thead><tr><th>Student</th><th>Course</th><th>Progress</th><th>Status</th><th>Payment</th></tr></thead>
                  <tbody>
                    {studentRows.map((s, i) => (
                      <tr key={`${s.id}-${s.course_id}-${i}`}>
                        <td>{s.name}<div className="muted">{s.email}</div></td>
                        <td>{s.course_title}</td>
                        <td>
                          <div className="inst-prog">
                            <span style={{ width: `${Number(s.progress || 0)}%` }} />
                          </div>
                          {Number(s.progress || 0)}%
                        </td>
                        <td><span className="panel-pill">{s.status}</span></td>
                        <td>{s.payment_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </div>

      {contentCourse && (
        <CourseLevels courseId={contentCourse.id} role="instructor" onClose={() => setContentCourse(null)} />
      )}

      {edit && (
        <div className="overlay" role="dialog" aria-modal="true">
          <form className="modal modal-gfg panel-modal" onSubmit={saveCourse}>
            <button type="button" className="icon-btn modal-close" onClick={() => setEdit(null)} aria-label="Close"><X size={16} /></button>
            <h2>Update course</h2>
            <div className="panel-form-grid">
              <label>Title<input required value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label>Level<input value={form.level || ''} onChange={(e) => setForm({ ...form, level: e.target.value })} /></label>
              <label>Price<input value={form.price || ''} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
              <label>Weeks<input value={form.weeks || ''} onChange={(e) => setForm({ ...form, weeks: e.target.value })} /></label>
              <label>Seats<input value={form.seats || ''} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></label>
              <label>Live
                <select value={form.live || '1'} onChange={(e) => setForm({ ...form, live: e.target.value })}>
                  <option value="1">Live</option>
                  <option value="0">Self-paced</option>
                </select>
              </label>
              <label className="full">Description<textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            </div>
            <button type="submit" className="btn panel-teal btn-wide">Save course</button>
          </form>
        </div>
      )}
    </div>
  )
}
