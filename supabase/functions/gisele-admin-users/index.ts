import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Gera o link de definicao de senha via admin API (nao depende do "Site URL" do
// projeto Supabase, que e compartilhado com controle-pronutro e o gastozap e
// pode redirecionar pro app errado) e manda por Resend.
async function enviarLinkDeSenha(adminClient: ReturnType<typeof createClient>, email: string, name: string | null): Promise<boolean> {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://controle-gisele.vercel.app/reset-senha' },
  });
  if (error || !data?.properties?.action_link) return false;

  const link = data.properties.action_link;
  const saudacao = name ? `Olá, ${name}!` : 'Olá!';
  const html = `
    <p>${saudacao}</p>
    <p>Você foi cadastrada no sistema da Dra. Gisele Falcão. Clique no botão abaixo para criar sua senha de acesso:</p>
    <p><a href="${link}" style="background:#C4956A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Criar minha senha</a></p>
    <p>Se o botão não funcionar, copie e cole este link no navegador:<br>${link}</p>
  `;
  const text = `${saudacao}\n\nVocê foi cadastrada no sistema da Dra. Gisele Falcão. Acesse o link abaixo para criar sua senha:\n\n${link}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: 'Gisele Falcão <noreply@btechsouto.shop>',
      to: [email],
      subject: 'Defina sua senha de acesso — Gisele Falcão',
      html, text,
    }),
  });
  return res.ok;
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

        emailSent = await enviarLinkDeSenha(adminClient, email, name ?? null);
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
      const { data: existingRow } = await adminClient
        .from('gisele_users')
        .select('nome')
        .eq('email', email)
        .maybeSingle();
      const ok = await enviarLinkDeSenha(adminClient, email, existingRow?.nome ?? name ?? null);
      if (!ok) {
        return new Response(JSON.stringify({ error: 'Erro ao enviar o email.' }), {
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
