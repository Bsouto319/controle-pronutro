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
// projeto Supabase, que e compartilhado com controle-gisele e o gastozap e pode
// redirecionar pro app errado) e manda por Resend.
async function enviarLinkDeSenha(adminClient: ReturnType<typeof createClient>, email: string, name: string | null): Promise<boolean> {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: 'https://controle-pronutro.vercel.app/reset-senha' },
  });
  if (error || !data?.properties?.action_link) return false;

  const link = data.properties.action_link;
  const saudacao = name ? `Olá, ${name}!` : 'Olá!';
  const html = `
    <p>${saudacao}</p>
    <p>Você foi cadastrada no sistema ProNutro. Clique no botão abaixo para criar sua senha de acesso:</p>
    <p><a href="${link}" style="background:#1aa04e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Criar minha senha</a></p>
    <p>Se o botão não funcionar, copie e cole este link no navegador:<br>${link}</p>
  `;
  const text = `${saudacao}\n\nVocê foi cadastrada no sistema ProNutro. Acesse o link abaixo para criar sua senha:\n\n${link}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: 'ProNutro <noreply@btechsouto.shop>',
      to: [email],
      subject: 'Defina sua senha de acesso — ProNutro',
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

    const { data: adminRow } = await adminClient
      .from('pronutro_admins')
      .select('id')
      .eq('user_id', caller.id)
      .maybeSingle();

    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'Acesso restrito a administradores.' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const { action, email, name } = await req.json();

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      const users = data.users.map(u => ({
        id: u.id,
        email: u.email,
        name: (u.user_metadata as { name?: string } | null)?.name ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
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
      const password = randomPassword();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: name ? { name } : undefined,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // Dispara o email de definicao de senha (mesmo fluxo do "Esqueceu a senha?")
      const emailSent = await enviarLinkDeSenha(adminClient, email, name ?? null);

      return new Response(JSON.stringify({
        email: data.user?.email,
        password,
        email_sent: emailSent,
      }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (action === 'resend') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'email é obrigatório.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
      const ok = await enviarLinkDeSenha(adminClient, email, name ?? null);
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
