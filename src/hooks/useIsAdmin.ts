import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return // ainda resolvendo a sessão — não decide nada ainda
    if (!user) { setIsAdmin(false); setLoading(false); return }
    supabase
      .from('pronutro_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data)
        setLoading(false)
      })
  }, [user, authLoading])

  return { isAdmin, loading: loading || authLoading }
}
