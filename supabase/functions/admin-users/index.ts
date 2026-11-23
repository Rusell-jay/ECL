// ===========================================================================
//  admin-users — privileged staff account management
//  Deploy: supabase functions deploy admin-users
//  The service role key never leaves the Edge Function runtime.
// ===========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const STAFF_ROLES = ['super_admin', 'admin', 'loan_officer']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Identify the caller from their JWT (never trust a user id in the body)
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: authData, error: authError } = await callerClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Invalid or expired session' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !callerProfile) return json({ error: 'Profile not found' }, 403)
    if (!['super_admin', 'admin'].includes(callerProfile.role) || !callerProfile.is_active) {
      return json({ error: 'Only administrators can manage staff accounts' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // -----------------------------------------------------------------------
    // Create a staff account
    // -----------------------------------------------------------------------
    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const fullName = String(body.full_name ?? '').trim()
      const phone = body.phone ? String(body.phone).trim() : null
      const role = String(body.role ?? 'loan_officer')

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'A valid email is required' }, 400)
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      if (!fullName) return json({ error: 'Full name is required' }, 400)
      if (!STAFF_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400)
      if (role === 'super_admin' && callerProfile.role !== 'super_admin') {
        return json({ error: 'Only a super admin can create another super admin' }, 403)
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone },
      })
      if (createError) return json({ error: createError.message }, 400)

      const { error: updateError } = await admin
        .from('profiles')
        .update({ role, full_name: fullName, phone })
        .eq('id', created.user.id)

      if (updateError) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: updateError.message }, 400)
      }

      await admin.from('audit_logs').insert({
        actor_id: callerProfile.id,
        actor_role: callerProfile.role,
        action: 'staff.created',
        entity: 'profile',
        entity_id: created.user.id,
        details: { email, role, full_name: fullName },
      })

      return json({ user_id: created.user.id, email, role })
    }

    // -----------------------------------------------------------------------
    // Update a staff member's role or active flag
    // -----------------------------------------------------------------------
    if (action === 'update') {
      const userId = String(body.user_id ?? '')
      const updates: Record<string, unknown> = {}
      if (body.role !== undefined) {
        if (!STAFF_ROLES.includes(body.role)) return json({ error: 'Invalid role' }, 400)
        if (body.role === 'super_admin' && callerProfile.role !== 'super_admin') {
          return json({ error: 'Only a super admin can grant super admin access' }, 403)
        }
        updates.role = body.role
      }
      if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
      if (body.full_name !== undefined) updates.full_name = String(body.full_name).trim()
      if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim() : null
      if (Object.keys(updates).length === 0) return json({ error: 'No changes supplied' }, 400)
      if (userId === callerProfile.id && (updates.role !== undefined || updates.is_active === false)) {
        return json({ error: 'You cannot change your own role or deactivate your own account' }, 400)
      }

      const { data: target, error: targetError } = await admin
        .from('profiles').select('role, is_active').eq('id', userId).single()
      if (targetError || !target) return json({ error: 'User not found' }, 404)

      if (target.role === 'super_admin' && callerProfile.role !== 'super_admin') {
        return json({ error: 'Only a super admin can modify a super admin' }, 403)
      }
      if (target.role === 'super_admin' && updates.role && updates.role !== 'super_admin') {
        const { count } = await admin
          .from('profiles').select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin').eq('is_active', true)
        if ((count ?? 0) <= 1) return json({ error: 'At least one active super admin is required' }, 400)
      }

      const { error: updateError } = await admin.from('profiles').update(updates).eq('id', userId)
      if (updateError) return json({ error: updateError.message }, 400)

      // Disabling an account must also block authentication itself. The profile
      // flag makes RLS treat the user as anon; the ban stops new sign-ins.
      let warning: string | undefined
      if (updates.is_active !== undefined) {
        const { error: banError } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: updates.is_active ? 'none' : '876000h',
        })
        if (banError) warning = `Profile updated, but the auth ban could not be applied: ${banError.message}`
      }

      await admin.from('audit_logs').insert({
        actor_id: callerProfile.id,
        actor_role: callerProfile.role,
        action: 'staff.updated',
        entity: 'profile',
        entity_id: userId,
        details: updates,
      })

      return json({ updated: true, ...(warning ? { warning } : {}) })
    }

    // -----------------------------------------------------------------------
    // Reset a staff member's password
    // -----------------------------------------------------------------------
    if (action === 'reset_password') {
      const userId = String(body.user_id ?? '')
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      if (userId === callerProfile.id) return json({ error: 'Use the account settings page to change your own password' }, 400)

      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)

      await admin.from('audit_logs').insert({
        actor_id: callerProfile.id,
        actor_role: callerProfile.role,
        action: 'staff.password_reset',
        entity: 'profile',
        entity_id: userId,
        details: {},
      })
      return json({ updated: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('admin-users error', error)
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
