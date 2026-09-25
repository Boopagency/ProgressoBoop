/**
 * Configuração pública do Supabase (CONFIG, não é segredo): a URL do projeto e
 * a chave publicável. A segurança dos dados vem das políticas de RLS; nenhuma
 * chave secreta ou service role é usada pelo app.
 */
export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja .env.example)."
    )
  }
  return { url, publishableKey }
}
