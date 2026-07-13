import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem autenticação.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error('Usuário não autenticado.');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRow } = await adminClient
      .from('gisele_users')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle();

    if (callerRow?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso restrito à Dra. Gisele (admin).' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const { action, email, name } = await req.json();

    // auth.users é compartilhado com o controle-pronutro (mesmo projeto Supabase).
    // Por isso toda listagem/criação aqui fica restrita ao que está em gisele_users,
    // pra não misturar com os usuários do outro sistema.
    if (action === 'list') {
      const { data: rows, error } = await adminClient
        .from('gisele_users')
        .select('user_id, email, nome, role, created_at')
        .order('created_at');
      if (error) throw error;

      const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers();
      if (authErr) throw authErr;
      const authById = new Map(authData.users.map(u => [u.id, u]));

      const users = (rows ?? []).map(r => ({
        id: r.user_id,
        email: r.email,
        name: r.nome,
        role: r.role,
        created_at: r.created_at,
        last_sign_in_at: authById.get(r.user_id)?.last_sign_in_at ?? null,
      }));

      return new Response(JSON.stringify({ users }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (action === 'create') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'email é obrigatório.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // Se o email já existe no projeto (ex: já é usuário do pronutro), só damos
      // acesso ao app da Gisele em vez de tentar criar duplicado.
      const { data: existingList } = await adminClient.auth.admin.listUsers();
      const existing = existingList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

      let userId: string;
      let password: string | null = null;
      let emailSent = false;

      if (existing) {
        userId = existing.id;
      } else {
        password = randomPassword();
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: name ? { name } : undefined,
        });
        if (error || !data.user) {
          return new Response(JSON.stringify({ error: error?.message ?? 'erro ao criar usuário' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
          });
        }
        userId = data.user.id;

        const anonClient = createClient(supabaseUrl, anonKey);
        const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://controle-gisele.vercel.app/reset-senha',
        });
        emailSent = !resetError;
      }

      const { error: giseleErr } = await adminClient
        .from('gisele_users')
        .upsert({ user_id: userId, email, nome: name ?? null, role: 'funcionario' }, { onConflict: 'user_id' });
      if (giseleErr) throw giseleErr;

      return new Response(JSON.stringify({ email, password, email_sent: emailSent, already_existed: !!existing }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (action === 'resend') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'email é obrigatório.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const anonClient = createClient(supabaseUrl, anonKey);
      const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://controle-gisele.vercel.app/reset-senha',
      });
      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      return new Response(JSON.stringify({ email, email_sent: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify({ error: 'action inválida.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
