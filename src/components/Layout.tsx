import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-gray-800">Controle ProNutro</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/"
              className={`px-3 py-1 rounded-md transition-colors ${pathname === '/' ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}
            >
              Pacientes
            </Link>
            <Link
              to="/novo-paciente"
              className={`px-3 py-1 rounded-md transition-colors ${pathname === '/novo-paciente' ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}
            >
              + Novo
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
