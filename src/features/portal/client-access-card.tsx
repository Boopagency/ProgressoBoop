"use client";

import { ClipboardCopy, KeyRound, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PanelCard, PanelCount } from "@/components/panel-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccessDelivery,
  createClientAccess,
  removeClientMember,
  resetClientPassword,
} from "@/features/portal/access-actions";
import type { ClientMember } from "@/features/portal/access-queries";

/**
 * Página do cliente: quem do cliente entra no portal (`/portal`). Dar acesso
 * cria a conta com uma senha provisória (ou liga a conta que a pessoa já tem);
 * "Nova senha" troca a senha de quem perdeu a dela; tirar acesso só desliga
 * do cliente.
 */
export function ClientAccessCard({
  clientId,
  clientName,
  members,
}: {
  clientId: string;
  clientName: string;
  members: ClientMember[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [removing, setRemoving] = useState<ClientMember | null>(null);
  const [resetting, setResetting] = useState<ClientMember | null>(null);
  const [delivered, setDelivered] = useState<{
    name: string;
    delivery: AccessDelivery;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setDialogKey((key) => key + 1);
    setDialogOpen(true);
  }

  function confirmRemove() {
    const member = removing;
    if (!member) return;
    startTransition(async () => {
      const result = await removeClientMember(clientId, member.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRemoving(null);
      toast.success(`${member.full_name} não acessa mais o portal.`);
    });
  }

  function confirmReset() {
    const member = resetting;
    if (!member) return;
    startTransition(async () => {
      const result = await resetClientPassword(clientId, member.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResetting(null);
      setDelivered({ name: member.full_name, delivery: result.data });
    });
  }

  return (
    <PanelCard
      id="acesso-cliente"
      title={
        <>
          Acesso do cliente
          <PanelCount value={members.length} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={openDialog}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Dar acesso
        </Button>
      }
    >
      {members.length === 0 ? (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Ninguém do cliente entra no portal ainda. Quem tiver acesso vê só o
          que é deste cliente.
        </p>
      ) : (
        <ul className="py-1">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {member.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => setResetting(member)}
                aria-label={`Gerar uma senha nova para ${member.full_name}`}
              >
                <KeyRound className="size-3.5" />
                Nova senha
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => setRemoving(member)}
                aria-label={`Tirar o acesso de ${member.full_name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <GrantAccessDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clientId={clientId}
        clientName={clientName}
        onDelivered={setDelivered}
      />

      <AccessDeliveredDialog
        delivered={delivered}
        onClose={() => setDelivered(null)}
      />

      <AlertDialog
        open={resetting !== null}
        onOpenChange={(open) => (open ? null : setResetting(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Gerar uma senha nova para {resetting?.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A senha atual deixa de funcionar. Você vai ver a senha nova para
              copiar e mandar para a pessoa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmReset();
              }}
            >
              {isPending ? "Gerando…" : "Gerar senha nova"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Tirar o acesso de {removing?.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa deixa de ver {clientName} no portal. Para devolver o
              acesso, é só dar acesso de novo com o mesmo e-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmRemove();
              }}
            >
              {isPending ? "Tirando…" : "Tirar acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelCard>
  );
}

function GrantAccessDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onDelivered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onDelivered: (delivered: { name: string; delivery: AccessDelivery }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createClientAccess(clientId, { name, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onDelivered({ name: name.trim(), delivery: result.data });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar acesso ao portal</DialogTitle>
          <DialogDescription>
            A pessoa vai ver só o que é de {clientName}. A conta é criada com
            uma senha provisória, que você copia e manda para ela.
          </DialogDescription>
        </DialogHeader>
        <form
          id="dar-acesso"
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="acesso-nome">Nome</Label>
            <Input
              id="acesso-nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Barbara"
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acesso-email">E-mail</Label>
            <Input
              id="acesso-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@empresa.com.br"
              maxLength={320}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="dar-acesso"
            disabled={isPending || !name.trim() || !email.trim()}
          >
            {isPending ? "Criando…" : "Dar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Texto pronto para a equipe mandar à pessoa (WhatsApp, por exemplo). */
function accessMessage(name: string, delivery: AccessDelivery): string {
  const loginUrl = `${window.location.origin}/login`;
  if (delivery.kind === "existing") {
    return [
      `Olá, ${name}! Você já pode acompanhar tudo no portal da Boop:`,
      loginUrl,
      `Entre com o e-mail ${delivery.email} e a senha que você já usa.`,
    ].join("\n");
  }
  return [
    `Olá, ${name}! Este é o seu acesso ao portal da Boop:`,
    loginUrl,
    `E-mail: ${delivery.email}`,
    `Senha provisória: ${delivery.password}`,
    "Depois de entrar, você pode trocar a senha em Minha conta, tocando no seu nome.",
  ].join("\n");
}

function AccessDeliveredDialog({
  delivered,
  onClose,
}: {
  delivered: { name: string; delivery: AccessDelivery } | null;
  onClose: () => void;
}) {
  const delivery = delivered?.delivery;

  function copy() {
    if (!delivered) return;
    void navigator.clipboard
      .writeText(accessMessage(delivered.name, delivered.delivery))
      .then(
        () => toast.success("Mensagem copiada"),
        () => toast.error("Não foi possível copiar."),
      );
  }

  return (
    <Dialog
      open={delivered !== null}
      onOpenChange={(open) => (open ? null : onClose())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{delivered?.name} já pode entrar no portal</DialogTitle>
          <DialogDescription>
            {delivery?.kind === "password"
              ? "Copie a mensagem e mande para a pessoa. A senha não aparece de novo; se ela perder, gere uma nova."
              : "Esse e-mail já tinha conta de cliente: a pessoa entra com a senha que já usa. Se ela não lembrar, use “Nova senha”."}
          </DialogDescription>
        </DialogHeader>
        {delivery ? (
          <dl className="space-y-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <div className="flex items-baseline gap-3">
              <dt className="w-16 shrink-0 text-xs text-muted-foreground">
                E-mail
              </dt>
              <dd className="min-w-0 break-all">{delivery.email}</dd>
            </div>
            {delivery.kind === "password" ? (
              <div className="flex items-baseline gap-3">
                <dt className="w-16 shrink-0 text-xs text-muted-foreground">
                  Senha
                </dt>
                <dd
                  className="font-mono text-[15px] tracking-wide select-all"
                  data-testid="senha-provisoria"
                >
                  {delivery.password}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={copy}>
            <ClipboardCopy />
            Copiar mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
