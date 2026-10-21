"use server";

import { randomInt } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/features/auth/session";
import { dbFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { isUuid } from "@/lib/utils";

/*
 * Acesso do cliente ao portal (lado da equipe). A equipe cria a conta aqui
 * mesmo, com uma senha provisória gerada no servidor, e passa a senha para a
 * pessoa (ainda não há serviço de e-mail). A conta é criada e ligada ao
 * cliente pela função `create_client_account`, que confere no banco quem
 * chama e recusa contas da equipe; sem service role no app.
 *
 * Quando o e-mail entrar (Resend), `deliverAccess` passa a mandar o convite e
 * a senha deixa de aparecer na tela.
 */

const NAME_MAX = 120;
const EMAIL_MAX = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CLIENT_GONE = "Esse cliente não existe mais.";
const MEMBER_GONE = "Esse acesso não existe mais.";
const NAME_REQUIRED = "Informe o nome de quem vai acessar.";

/** Erros das funções de acesso (a mensagem do banco é o código). */
const ACCESS_ERRORS: Partial<Record<string, string>> = {
  account_is_team:
    "Esse e-mail é de alguém da equipe, que já vê tudo no admin.",
  client_not_found: CLIENT_GONE,
  member_not_found: MEMBER_GONE,
  invalid_name: NAME_REQUIRED,
  invalid_email: "Informe um e-mail válido.",
};

/** Como a pessoa recebe o acesso. Hoje a equipe copia e envia; depois, convite por e-mail. */
export type AccessDelivery =
  | { kind: "password"; email: string; password: string }
  | { kind: "existing"; email: string };

/** Sem 0/O, 1/l/I: a senha é lida e digitada por alguém no celular. */
const PASSWORD_ALPHABET =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Senha provisória no formato `xxxx-xxxx-xxxx`, sempre com letras e números. */
function generateTempPassword(): string {
  for (;;) {
    const chars = Array.from(
      { length: 12 },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
    );
    const password = [0, 4, 8]
      .map((at) => chars.slice(at, at + 4).join(""))
      .join("-");
    if (/\d/.test(password) && /[a-z]/i.test(password)) return password;
  }
}

function refreshClient(clientId: string) {
  revalidatePath(`/clientes/${clientId}`);
}

function accessFailure(
  error: PostgrestError,
  fallback: string,
): ActionResult<never> {
  const known = ACCESS_ERRORS[error.message];
  if (known) return { ok: false, error: known };
  return dbFailure(error, fallback);
}

/**
 * Dá acesso ao portal: cria a conta com senha provisória ou, se o e-mail já
 * tem conta de cliente (de outro cliente, por exemplo), só liga a conta.
 */
export async function createClientAccess(
  clientId: string,
  input: { email: string; name: string },
): Promise<ActionResult<AccessDelivery>> {
  await requireUser();
  if (!isUuid(clientId)) return { ok: false, error: CLIENT_GONE };
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(input.name ?? "").trim();
  if (!name || name.length > NAME_MAX)
    return { ok: false, error: NAME_REQUIRED };
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email))
    return { ok: false, error: "Informe um e-mail válido." };

  const password = generateTempPassword();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_client_account", {
    target_client: clientId,
    member_email: email,
    member_name: name,
    temp_password: password,
  });
  if (error) return accessFailure(error, "Não foi possível dar o acesso.");
  refreshClient(clientId);
  return {
    ok: true,
    data: deliverAccess(email, data[0]?.created ? password : null),
  };
}

/** Gera uma senha provisória nova para a conta de um acesso (quando a pessoa perdeu a dela). */
export async function resetClientPassword(
  clientId: string,
  memberId: string,
): Promise<ActionResult<AccessDelivery>> {
  await requireUser();
  if (!isUuid(clientId) || !isUuid(memberId))
    return { ok: false, error: MEMBER_GONE };

  const supabase = await createClient();
  const { data: member, error: loadFailed } = await supabase
    .from("client_members")
    .select("email")
    .eq("id", memberId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (loadFailed)
    return dbFailure(loadFailed, "Não foi possível gerar a senha.");
  if (!member) return { ok: false, error: MEMBER_GONE };

  const password = generateTempPassword();
  const { error } = await supabase.rpc("reset_client_password", {
    target_member: memberId,
    temp_password: password,
  });
  if (error) return accessFailure(error, "Não foi possível gerar a senha.");
  return { ok: true, data: deliverAccess(member.email, password) };
}

function deliverAccess(email: string, password: string | null): AccessDelivery {
  return password
    ? { kind: "password", email, password }
    : { kind: "existing", email };
}

export async function removeClientMember(
  clientId: string,
  memberId: string,
): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(clientId) || !isUuid(memberId))
    return { ok: false, error: MEMBER_GONE };

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_members")
    .delete()
    .eq("id", memberId)
    .eq("client_id", clientId);
  if (error) return dbFailure(error, "Não foi possível tirar o acesso.");
  refreshClient(clientId);
  return { ok: true, data: null };
}

/**
 * Nome de quem respondeu uma etapa pelo portal (aprovou ou pediu ajustes),
 * para a equipe ver na tarefa. A conta pode ter perdido o acesso: aí volta
 * "Conta removida".
 */
export async function loadClientMemberName(
  userId: string,
): Promise<ActionResult<string>> {
  await requireUser();
  if (!isUuid(userId)) return { ok: true, data: "Conta removida" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_members")
    .select("full_name")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  if (error)
    return dbFailure(error, "Não foi possível carregar quem respondeu.");
  return { ok: true, data: data[0]?.full_name ?? "Conta removida" };
}
