"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { AccountDialog } from "@/features/account/account-dialog"
import { PortalAlertsPreview } from "@/features/portal/portal-alerts"
import { PortalReferralView } from "@/features/portal/referral-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, USER } from "../exemplos"

/** Minha conta no portal (aberta pelo nome no menu ou em Mais), por cima de uma tela. */
export default function VitrineAccountPage() {
  const [open, setOpen] = useState(true)
  return (
    <VitrineShell area="portal" active="/portal/indicar">
      <PortalAlertsPreview counts={{ messages: 2, notifications: 3 }}>
        <div className="fixed right-4 bottom-24 z-40 md:bottom-6">
          <Button variant="glass" onClick={() => setOpen(true)}>
            Abrir Minha conta
          </Button>
        </div>
        <PortalReferralView clientId={CLIENT.id} clientName={CLIENT.name} referrals={[]} today={todayKey()} />
        <AccountDialog open={open} onOpenChange={setOpen} user={USER} />
      </PortalAlertsPreview>
    </VitrineShell>
  )
}
