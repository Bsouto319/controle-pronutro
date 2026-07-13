import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function guessMime(url: string, contentType: string | null): string {
  if (contentType && contentType !== 'application/octet-stream') return contentType;
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { bioimpedancia_id } = await req.json();
    if (!bioimpedancia_id) {
      return new Response(JSON.stringify({ error: 'bioimpedancia_id e obrigatorio' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: bio, error: bioErr } = await db
      .from('pronutro_bioimpedancia')
      .select('id, patient_id, data_exame, arquivo_url')
      .eq('id', bioimpedancia_id)
      .single();
    if (bioErr || !bio) throw new Error('exame nao encontrado');

    const { data: patient } = await db
      .from('pronutro_patients')
      .select('nome, dosagem_inicial_mg')
      .eq('id', bio.patient_id)
      .single();

    const { data: evolucao } = await db
      .from('pronutro_evolucao')
      .select('semana, peso_kg, gordura_pct, data_medicao')
      .eq('patient_id', bio.patient_id)
      .order('semana');

    const historico = (evolucao ?? [])
      .filter(e => e.peso_kg || e.gordura_pct)
      .map(e => `Semana ${e.semana}${e.data_medicao ? ` (${e.data_medicao})` : ''}: peso ${e.peso_kg ?? '?'}kg, gordura ${e.gordura_pct ?? '?'}%`)
      .join('\n');

    const fileRes = await fetch(bio.arquivo_url);
    if (!fileRes.ok) throw new Error('nao consegui baixar o arquivo anexado');
    const buf = await fileRes.arrayBuffer();
    const mime = guessMime(bio.arquivo_url, fileRes.headers.get('content-type'));
    const b64 = toBase64(buf);

    const promptTexto = `Você é um assistente clínico de nutrologia analisando um exame de bioimpedância (InBody) do(a) paciente ${patient?.nome ?? 'paciente'}, feito em ${bio.data_exame}.

${historico ? `Histórico de peso/gordura já registrado no sistema de controle de dose:\n${historico}\n` : ''}
Leia a imagem/documento do exame anexado e escreva uma análise curta e prática (máximo 6 frases, em português) para a equipe da clínica, cobrindo:
1. Os principais números do exame (peso, % de gordura corporal, massa muscular esquelética, gordura visceral) e se estão dentro, acima ou abaixo da faixa de referência indicada no próprio relatório.
2. Se houver histórico anterior no relatório (gráfico de evolução), comente a tendência (melhorou, piorou, estável).
3. Um ponto de atenção prático, se houver (ex: gordura visceral alta, taxa metabólica basal baixa).
Seja direto, sem jargão desnecessário, como se estivesse resumindo pra um nutricionista que vai atender o paciente em seguida.`;

    const content: any[] = [{ type: 'text', text: promptTexto }];
    if (mime === 'application/pdf') {
      content.push({ type: 'file', file: { filename: 'exame.pdf', file_data: `data:application/pdf;base64,${b64}` } });
    } else {
      content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content }],
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => '');
      throw new Error(`OpenAI ${aiRes.status}: ${detail}`);
    }
    const aiData = await aiRes.json();
    const analise = aiData.choices?.[0]?.message?.content ?? null;
    if (!analise) throw new Error('OpenAI nao retornou analise');

    await db.from('pronutro_bioimpedancia').update({
      analise_gpt: analise,
      analise_gerada_em: new Date().toISOString(),
    }).eq('id', bio.id);

    return new Response(JSON.stringify({ ok: true, analise }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
