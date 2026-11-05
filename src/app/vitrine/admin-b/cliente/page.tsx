"use client"

import { ClientView } from "@/features/clients/client-view"
import { DEFAULT_SETTINGS } from "@/features/finance/management"
import { InstagramCard } from "@/features/instagram/instagram-card"
import { addDaysToKey, todayKey } from "@/lib/dates"

import { VB_CLIENTS, vbCommunications, vbDeals, vbEvents, vbIdeas, vbPosts, vbReviews } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** A página do Café Aurora, com todos os cartões e dados de exemplo. */
export default function VitrineClientPage() {
  const today = todayKey()
  const client = VB_CLIENTS[0]!
  return (
    <VitrineB active="/clientes">
      <ClientView
        client={client}
        reviews={vbReviews(today)}
        period={`${today.slice(0, 7)}-01`}
        events={vbEvents(today)}
        records={[]}
        docs={[]}
        templateDocs={[]}
        communications={vbCommunications(today)}
        decisions={[]}
        finance={{ entries: [], recurrences: [], settings: DEFAULT_SETTINGS, closings: [] }}
        paymentReminders={true}
        deals={vbDeals(today)}
        posts={vbPosts(today).filter((post) => post.client_id === client.id)}
        ideas={vbIdeas().filter((idea) => idea.client_id === client.id)}
        members={[]}
        files={[]}
        instagramCard={
          <InstagramCard
            clientId={client.id}
            clientName={client.name}
            data={{
              configured: true,
              account: {
                username: "aurora.cafe",
                displayName: "Café Aurora",
                pictureUrl: null,
                accountType: "business",
                permissions: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
                status: "connected",
                tokenExpiresAt: `${addDaysToKey(today, 40)}T12:00:00.000Z`,
                connectedAt: `${addDaysToKey(today, -20)}T12:00:00.000Z`,
                connectedByName: "Jabez Oriel",
              },
            }}
            notice={null}
            audience="team"
            today={today}
          />
        }
      />
    </VitrineB>
  )
}
