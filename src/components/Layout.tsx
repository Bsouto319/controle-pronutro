import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-gray-800 hidden sm:block">Controle ProNutro</span>
            <span className="font-semibold text-gray-800 sm:hidden text-sm">ProNutro</span>
          </Link>
          <nav className="flex gap-2 text-sm">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${pathname === '/' ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}
            >
              Pacientes
            </Link>
            <Link
              to="/novo-paciente"
              className={`px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${pathname === '/novo-paciente' ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}
            >
              + Novo
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-4 sm:py-6">{children}</main>
    </div>
  )
}
