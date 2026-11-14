import { Outlet, useLocation } from 'react-router-dom'
import { AuthModal } from './AuthModal'
import { Footer } from './Footer'
import { Header } from './Header'
import { HelpTip } from './HelpTip'

export function Layout() {
  const { pathname } = useLocation()
  const isPanel =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/instructor') ||
    pathname.startsWith('/dashboard')

  return (
    <>
      {!isPanel && <Header />}
      <main className={isPanel ? 'panel-root' : undefined}>
        <Outlet />
      </main>
      {!isPanel && <Footer />}
      <AuthModal />
      {!isPanel && <HelpTip />}
    </>
  )
}
