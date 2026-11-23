import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { describeSupabaseError, supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [borrower, setBorrower] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  const loadProfile = useCallback(async (userId) => {
    setProfileError(null)
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setProfileError(describeSupabaseError(error))
      return null
    }
    setProfile(prof ?? null)

    if (prof?.role === 'borrower') {
      const { data: borrowerRow, error: borrowerError } = await supabase
        .from('borrowers')
        .select('*')
        .eq('profile_id', userId)
        .maybeSingle()
      if (borrowerError) setProfileError(describeSupabaseError(borrowerError))
      setBorrower(borrowerRow ?? null)
    } else {
      setBorrower(null)
    }
    return prof
  }, [])

  const refresh = useCallback(async () => {
    if (!session?.user?.id) return null
    return loadProfile(session.user.id)
  }, [session?.user?.id, loadProfile])

  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session ?? null)
        if (!data.session) setLoading(false)
      })
      .catch((error) => {
        if (!active) return
        setProfileError(describeSupabaseError(error))
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      if (!nextSession) {
        setProfile(null)
        setBorrower(null)
        setProfileError(null)
        setLoading(false)
      } else {
        setLoading(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    let active = true
    setLoading(true)
    loadProfile(session.user.id).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [session?.user?.id, loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const signUp = useCallback(async ({ email, password, metadata }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      borrower,
      loading,
      profileError,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refresh,
      isStaff: Boolean(profile && ['super_admin', 'admin', 'loan_officer'].includes(profile.role)),
      isAdmin: Boolean(profile && ['super_admin', 'admin'].includes(profile.role)),
      isBorrower: profile?.role === 'borrower',
    }),
    [session, profile, borrower, loading, profileError, signIn, signUp, signOut, resetPassword, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
