import { Outlet, Link } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-bold text-gray-900">
          R&D Hub
        </Link>
        <div className="flex gap-4 text-sm">
          <Link to="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
          <Link to="/projects" className="text-gray-600 hover:text-gray-900">Projects</Link>
        </div>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
