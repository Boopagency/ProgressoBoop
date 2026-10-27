import "server-only"

/**
 * Configuração do app da Meta, só no servidor (variáveis de ambiente da
 * Vercel, nunca no código): INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET para o
 * OAuth; INSTAGRAM_JOBS_SECRET para a rota de jobs (o mesmo valor de
 * `instagram_jobs_secret` no Vault). Sem elas, o app compila e o cartão diz que
 * a integração não está configurada.
 */
export function instagramApp(): { appId: string; appSecret: string } | null {
  const appId = process.env.INSTAGRAM_APP_ID?.trim()
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim()
  return appId && appSecret ? { appId, appSecret } : null
}

export function instagramJobsSecret(): string | null {
  return process.env.INSTAGRAM_JOBS_SECRET?.trim() || null
}
