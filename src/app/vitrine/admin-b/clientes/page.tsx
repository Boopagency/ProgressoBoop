"use client"

import { ClientsView } from "@/features/clients/clients-view"
import { todayKey } from "@/lib/dates"

import { VB_CLIENTS, vbEvents, vbReviews } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** A lista de Clientes de verdade, com dados de exemplo. */
export default function VitrineClientsPage() {
  const today = todayKey()
  return (
    <VitrineB active="/clientes">
      <ClientsView clients={VB_CLIENTS} reviews={vbReviews(today)} events={vbEvents(today)} />
    </VitrineB>
  )
}
