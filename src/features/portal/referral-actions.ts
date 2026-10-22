"use server"

import { revalidatePath } from "next/cache"

import { validateReferral, type ReferralInput } from "@/features/portal/referral-logic"
import { getPortalUser } from "@/features/portal/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Indicação feita no portal: o banco (portal_refer_lead) confere o cliente,
 * grava o negócio no Comercial e avisa quem cuida das indicações.
 */

const SIGNED_OUT = "Sua sessão terminou. Entre de novo."
const CLIENT_GONE = "Não foi possível identificar o cliente. Atualize a página."

const PORTAL_ERRORS: Partial<Record<string, string>> = {
  client_not_found: CLIENT_GONE,
  invalid_name: "Diga o nome de quem você está indicando.",
  invalid_company: "Confira o nome da empresa.",
  invalid_phone: "Confira o WhatsApp (com DDD).",
  invalid_email: "Confira o e-mail.",
  contact_required: "Deixe um WhatsApp ou um e-mail para a gente falar com a pessoa.",
  invalid_note: "O recado ficou longo demais.",
  too_many_referrals: "Já recebemos muitas indicações hoje. Tente de novo amanhã ou fale com a equipe.",
}

export async function sendPortalReferral(clientId: string, input: Partial<ReferralInput>): Promise<ActionResult> {
  if (!(await getPortalUser())) return { ok: false, error: SIGNED_OUT }
  if (!isUuid(clientId)) return { ok: false, error: CLIENT_GONE }
  const parsed = validateReferral(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { error } = await supabase.rpc("portal_refer_lead", {
    target_client: clientId,
    referral_name: parsed.data.name,
    referral_company: parsed.data.company,
    referral_phone: parsed.data.phone,
    referral_email: parsed.data.email,
    referral_note: parsed.data.note,
  })
  if (error) {
    const known = PORTAL_ERRORS[error.message]
    return known ? { ok: false, error: known } : dbFailure(error, "Não foi possível enviar a indicação.")
  }
  revalidatePath("/portal/indicar")
  revalidatePath("/comercial")
  return { ok: true, data: null }
}
