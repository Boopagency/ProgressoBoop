export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          body: string | null
          changes: Json
          client_id: string | null
          created_at: string
          edited_at: string | null
          entity_id: string
          entity_title: string
          entity_type: string
          id: string
          project_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          body?: string | null
          changes?: Json
          client_id?: string | null
          created_at?: string
          edited_at?: string | null
          entity_id: string
          entity_title?: string
          entity_type: string
          id?: string
          project_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          body?: string | null
          changes?: Json
          client_id?: string | null
          created_at?: string
          edited_at?: string | null
          entity_id?: string
          entity_title?: string
          entity_type?: string
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          checklist: Json
          client_id: string
          created_at: string
          created_by: string
          done: boolean
          done_at: string | null
          done_by: string | null
          health: Database["public"]["Enums"]["client_health"] | null
          id: string
          notes: string | null
          period: string
          updated_at: string
        }
        Insert: {
          checklist?: Json
          client_id: string
          created_at?: string
          created_by?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          health?: Database["public"]["Enums"]["client_health"] | null
          id?: string
          notes?: string | null
          period: string
          updated_at?: string
        }
        Update: {
          checklist?: Json
          client_id?: string
          created_at?: string
          created_by?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          health?: Database["public"]["Enums"]["client_health"] | null
          id?: string
          notes?: string | null
          period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          avatar_path: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          instagram_bio: string | null
          instagram_handle: string | null
          name: string
          notes: string | null
          owner_id: string | null
          review_day: number | null
          services: string[]
          since: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_path?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          instagram_bio?: string | null
          instagram_handle?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          review_day?: number | null
          services?: string[]
          since?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_path?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          instagram_bio?: string | null
          instagram_handle?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          review_day?: number | null
          services?: string[]
          since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          channel: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          created_at: string
          created_by: string
          details: string | null
          id: string
          kind: Database["public"]["Enums"]["communication_kind"]
          occurred_on: string
          project_id: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          created_at?: string
          created_by?: string
          details?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["communication_kind"]
          occurred_on?: string
          project_id?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id?: string
          created_at?: string
          created_by?: string
          details?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["communication_kind"]
          occurred_on?: string
          project_id?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          format: Database["public"]["Enums"]["content_format"] | null
          id: string
          notes: string | null
          post_id: string | null
          reference_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string
          format?: Database["public"]["Enums"]["content_format"] | null
          id?: string
          notes?: string | null
          post_id?: string | null
          reference_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          format?: Database["public"]["Enums"]["content_format"] | null
          id?: string
          notes?: string | null
          post_id?: string | null
          reference_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ideas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ideas_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          brief: string | null
          caption: string | null
          client_id: string
          copy_status: Database["public"]["Enums"]["content_front_status"]
          cover_path: string | null
          created_at: string
          created_by: string
          design_notes: string | null
          design_status: Database["public"]["Enums"]["content_front_status"]
          drive_url: string | null
          format: Database["public"]["Enums"]["content_format"]
          id: string
          intents: Database["public"]["Enums"]["content_intent"][]
          networks: Database["public"]["Enums"]["content_network"][]
          owner_id: string | null
          pinned: boolean
          project_id: string | null
          publish_on: string | null
          publish_time: string | null
          published_at: string | null
          script: string | null
          slides: Json
          stage: Database["public"]["Enums"]["content_stage"]
          title: string
          updated_at: string
          video_status: Database["public"]["Enums"]["content_front_status"]
        }
        Insert: {
          brief?: string | null
          caption?: string | null
          client_id: string
          copy_status?: Database["public"]["Enums"]["content_front_status"]
          cover_path?: string | null
          created_at?: string
          created_by?: string
          design_notes?: string | null
          design_status?: Database["public"]["Enums"]["content_front_status"]
          drive_url?: string | null
          format: Database["public"]["Enums"]["content_format"]
          id?: string
          intents?: Database["public"]["Enums"]["content_intent"][]
          networks?: Database["public"]["Enums"]["content_network"][]
          owner_id?: string | null
          pinned?: boolean
          project_id?: string | null
          publish_on?: string | null
          publish_time?: string | null
          published_at?: string | null
          script?: string | null
          slides?: Json
          stage?: Database["public"]["Enums"]["content_stage"]
          title: string
          updated_at?: string
          video_status: Database["public"]["Enums"]["content_front_status"]
        }
        Update: {
          brief?: string | null
          caption?: string | null
          client_id?: string
          copy_status?: Database["public"]["Enums"]["content_front_status"]
          cover_path?: string | null
          created_at?: string
          created_by?: string
          design_notes?: string | null
          design_status?: Database["public"]["Enums"]["content_front_status"]
          drive_url?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          id?: string
          intents?: Database["public"]["Enums"]["content_intent"][]
          networks?: Database["public"]["Enums"]["content_network"][]
          owner_id?: string | null
          pinned?: boolean
          project_id?: string | null
          publish_on?: string | null
          publish_time?: string | null
          published_at?: string | null
          script?: string | null
          slides?: Json
          stage?: Database["public"]["Enums"]["content_stage"]
          title?: string
          updated_at?: string
          video_status?: Database["public"]["Enums"]["content_front_status"]
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          client_id: string | null
          closed_on: string | null
          company: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          expected_close_on: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          one_time_cents: number
          opened_on: string
          owner_id: string | null
          probability: number | null
          project_id: string | null
          proposal_sent_on: string | null
          reached_stage: Database["public"]["Enums"]["deal_stage"]
          recurrence_id: string | null
          recurring_cents: number
          service: string | null
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["deal_stage"]
          term_months: number | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          closed_on?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          expected_close_on?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          one_time_cents?: number
          opened_on?: string
          owner_id?: string | null
          probability?: number | null
          project_id?: string | null
          proposal_sent_on?: string | null
          reached_stage?: Database["public"]["Enums"]["deal_stage"]
          recurrence_id?: string | null
          recurring_cents?: number
          service?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          term_months?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          closed_on?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          expected_close_on?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          one_time_cents?: number
          opened_on?: string
          owner_id?: string | null
          probability?: number | null
          project_id?: string | null
          proposal_sent_on?: string | null
          reached_stage?: Database["public"]["Enums"]["deal_stage"]
          recurrence_id?: string | null
          recurring_cents?: number
          service?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          term_months?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "finance_recurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          area: Database["public"]["Enums"]["task_area"] | null
          client_id: string | null
          context: string | null
          created_at: string
          created_by: string
          decided_on: string
          id: string
          meeting_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["decision_status"]
          title: string
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string
          decided_on?: string
          id?: string
          meeting_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          title: string
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          context?: string | null
          created_at?: string
          created_by?: string
          decided_on?: string
          id?: string
          meeting_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_versions: {
        Row: {
          content: Json
          created_at: string
          doc_id: string
          id: string
          saved_at: string
          saved_by: string | null
          title: string
        }
        Insert: {
          content: Json
          created_at?: string
          doc_id: string
          id?: string
          saved_at: string
          saved_by?: string | null
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          doc_id?: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_versions_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      docs: {
        Row: {
          area: Database["public"]["Enums"]["task_area"] | null
          client_id: string | null
          content: Json
          content_text: string
          content_updated_at: string
          content_updated_by: string | null
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          next_review_on: string | null
          owner_id: string | null
          pinned: boolean
          review_every_months: number | null
          reviewed_on: string | null
          search: unknown
          status: Database["public"]["Enums"]["doc_status"]
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          content?: Json
          content_text?: string
          content_updated_at?: string
          content_updated_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          next_review_on?: string | null
          owner_id?: string | null
          pinned?: boolean
          review_every_months?: number | null
          reviewed_on?: string | null
          search?: unknown
          status?: Database["public"]["Enums"]["doc_status"]
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          content?: Json
          content_text?: string
          content_updated_at?: string
          content_updated_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          next_review_on?: string | null
          owner_id?: string | null
          pinned?: boolean
          review_every_months?: number | null
          reviewed_on?: string | null
          search?: unknown
          status?: Database["public"]["Enums"]["doc_status"]
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_content_updated_by_fkey"
            columns: ["content_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          recurrence_rule: string | null
          start_at: string
          title: string
        }
        Insert: {
          all_day?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          recurrence_rule?: string | null
          start_at: string
          title: string
        }
        Update: {
          all_day?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          recurrence_rule?: string | null
          start_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_closings: {
        Row: {
          bank_balance_cents: number
          closed_at: string
          closed_by: string
          ledger_balance_cents: number
          notes: string | null
          period: string
        }
        Insert: {
          bank_balance_cents: number
          closed_at?: string
          closed_by?: string
          ledger_balance_cents: number
          notes?: string | null
          period: string
        }
        Update: {
          bank_balance_cents?: number
          closed_at?: string
          closed_by?: string
          ledger_balance_cents?: number
          notes?: string | null
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_closings_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          account: Database["public"]["Enums"]["finance_account"]
          amount_cents: number
          category: string | null
          client_id: string | null
          created_at: string
          created_by: string
          description: string
          due_on: string
          fee_cents: number
          id: string
          kind: Database["public"]["Enums"]["finance_kind"]
          notes: string | null
          paid_on: string | null
          period: string | null
          project_id: string | null
          recurrence_id: string | null
          skipped: boolean
          updated_at: string
        }
        Insert: {
          account: Database["public"]["Enums"]["finance_account"]
          amount_cents: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          description: string
          due_on: string
          fee_cents?: number
          id?: string
          kind: Database["public"]["Enums"]["finance_kind"]
          notes?: string | null
          paid_on?: string | null
          period?: string | null
          project_id?: string | null
          recurrence_id?: string | null
          skipped?: boolean
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["finance_account"]
          amount_cents?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_on?: string
          fee_cents?: number
          id?: string
          kind?: Database["public"]["Enums"]["finance_kind"]
          notes?: string | null
          paid_on?: string | null
          period?: string | null
          project_id?: string | null
          recurrence_id?: string | null
          skipped?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "finance_recurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_recurrences: {
        Row: {
          account: Database["public"]["Enums"]["finance_account"]
          amount_cents: number
          category: string | null
          client_id: string | null
          created_at: string
          created_by: string
          day_of_month: number
          description: string
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["finance_kind"]
          notes: string | null
          project_id: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          account: Database["public"]["Enums"]["finance_account"]
          amount_cents: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month: number
          description: string
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["finance_kind"]
          notes?: string | null
          project_id?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["finance_account"]
          amount_cents?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number
          description?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["finance_kind"]
          notes?: string | null
          project_id?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_recurrences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recurrences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          contract_alert_days: number
          id: boolean
          opening_balance_cents: number
          opening_on: string
          owner_draw_target_cents: number
          partners: number
          reinvest_share_bps: number
          reserve_months: number
          reserve_share_bps: number
          tax_rate_bps: number
          tax_rate_confirmed: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contract_alert_days?: number
          id?: boolean
          opening_balance_cents?: number
          opening_on?: string
          owner_draw_target_cents?: number
          partners?: number
          reinvest_share_bps?: number
          reserve_months?: number
          reserve_share_bps?: number
          tax_rate_bps?: number
          tax_rate_confirmed?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contract_alert_days?: number
          id?: boolean
          opening_balance_cents?: number
          opening_on?: string
          owner_draw_target_cents?: number
          partners?: number
          reinvest_share_bps?: number
          reserve_months?: number
          reserve_share_bps?: number
          tax_rate_bps?: number
          tax_rate_confirmed?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          baseline_value: number | null
          client_id: string | null
          created_at: string
          created_by: string
          id: string
          manual_value: number | null
          metric: string | null
          objective_id: string
          position: number
          target_value: number
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          baseline_value?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          manual_value?: number | null
          metric?: string | null
          objective_id: string
          position?: number
          target_value: number
          title: string
          unit?: string
          updated_at?: string
        }
        Update: {
          baseline_value?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          manual_value?: number | null
          metric?: string | null
          objective_id?: string
          position?: number
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_items: {
        Row: {
          content: string
          created_at: string
          created_by: string
          done: boolean
          due_date: string | null
          id: string
          kind: Database["public"]["Enums"]["meeting_item_kind"]
          meeting_id: string
          owner_id: string | null
          task_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string
          done?: boolean
          due_date?: string | null
          id?: string
          kind: Database["public"]["Enums"]["meeting_item_kind"]
          meeting_id: string
          owner_id?: string | null
          task_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          done?: boolean
          due_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["meeting_item_kind"]
          meeting_id?: string
          owner_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: Json | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          event_id: string
          id: string
          occurs_on: string
          search: unknown
          status: Database["public"]["Enums"]["meeting_status"]
          summary: string | null
          transcript: string | null
          transcript_length: number | null
          updated_at: string
        }
        Insert: {
          agenda?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          event_id: string
          id?: string
          occurs_on: string
          search?: unknown
          status?: Database["public"]["Enums"]["meeting_status"]
          summary?: string | null
          transcript?: string | null
          transcript_length?: number | null
          updated_at?: string
        }
        Update: {
          agenda?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          occurs_on?: string
          search?: unknown
          status?: Database["public"]["Enums"]["meeting_status"]
          summary?: string | null
          transcript?: string | null
          transcript_length?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          area: Database["public"]["Enums"]["task_area"] | null
          created_at: string
          created_by: string
          description: string | null
          ends_on: string
          id: string
          owner_id: string | null
          starts_on: string
          title: string
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["task_area"] | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_on: string
          id?: string
          owner_id?: string | null
          starts_on: string
          title: string
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["task_area"] | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_on?: string
          id?: string
          owner_id?: string | null
          starts_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          name: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          name: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          starts_on?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_on: string | null
          id: string
          name: string
          owner_id: string | null
          pinned: boolean
          starts_on: string
          status: Database["public"]["Enums"]["project_status"]
          template: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_on?: string | null
          id?: string
          name: string
          owner_id?: string | null
          pinned?: boolean
          starts_on: string
          status?: Database["public"]["Enums"]["project_status"]
          template?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_on?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          pinned?: boolean
          starts_on?: string
          status?: Database["public"]["Enums"]["project_status"]
          template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          page: string
          query: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name: string
          page?: string
          query?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          page?: string
          query?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          profile_id: string
          task_id: string
        }
        Insert: {
          profile_id: string
          task_id: string
        }
        Update: {
          profile_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: Database["public"]["Enums"]["task_area"] | null
          client_id: string | null
          client_review_id: string | null
          communication_id: string | null
          completed_at: string | null
          content_post_id: string | null
          created_at: string
          created_by: string
          description: string | null
          doc_id: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          client_review_id?: string | null
          communication_id?: string | null
          completed_at?: string | null
          content_post_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          doc_id?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_id?: string | null
          client_review_id?: string | null
          communication_id?: string | null
          completed_at?: string | null
          content_post_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          doc_id?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_review_id_fkey"
            columns: ["client_review_id"]
            isOneToOne: false
            referencedRelation: "client_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_content_post_id_fkey"
            columns: ["content_post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_decisions: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          week_start: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string
          id?: string
          week_start: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      restore_doc_version: {
        Args: { version_id: string; version_text: string }
        Returns: string
      }
      win_deal: {
        Args: {
          client_id?: string
          client_name?: string
          contract_day?: number
          contract_months?: number
          contract_starts_on?: string
          deal_id: string
          one_time_due_on?: string
          project_name?: string
        }
        Returns: Json
      }
    }
    Enums: {
      activity_action: "created" | "updated" | "deleted" | "comment"
      client_health: "healthy" | "attention" | "at_risk"
      communication_channel: "whatsapp" | "email" | "call" | "meeting" | "other"
      communication_kind:
        | "update"
        | "request"
        | "approval"
        | "feedback"
        | "other"
      content_format:
        | "reels"
        | "carousel"
        | "static"
        | "stories"
        | "video"
        | "photo"
        | "text"
      content_front_status:
        | "not_needed"
        | "todo"
        | "in_progress"
        | "missing_material"
        | "in_review"
        | "changes"
        | "done"
      content_intent:
        | "conversion"
        | "growth"
        | "authority"
        | "connection"
        | "sponsored"
      content_network: "instagram" | "tiktok" | "linkedin"
      content_stage:
        | "production"
        | "internal_review"
        | "client_review"
        | "approved"
        | "scheduled"
        | "published"
      deal_stage:
        | "lead"
        | "contact"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      decision_status: "active" | "revoked"
      doc_kind: "process" | "checklist" | "policy" | "guide"
      doc_status: "draft" | "active" | "review"
      event_type: "meeting" | "internal" | "delivery"
      finance_account:
        | "client_revenue"
        | "other_revenue"
        | "owner_contribution"
        | "direct_cost"
        | "fixed_cost"
        | "other_expense"
        | "tax"
        | "owner_draw"
        | "reinvestment"
      finance_kind: "income" | "expense"
      lead_source:
        | "referral"
        | "instagram"
        | "website"
        | "google"
        | "linkedin"
        | "whatsapp"
        | "outbound"
        | "event"
        | "existing_client"
        | "other"
      meeting_item_kind: "topic" | "agreement"
      meeting_status: "scheduled" | "done" | "canceled"
      project_status: "planned" | "active" | "paused" | "done" | "canceled"
      task_area:
        | "commercial"
        | "finance"
        | "operations"
        | "brand"
        | "technology"
        | "clients"
      task_priority: "low" | "normal" | "high"
      task_status: "todo" | "doing" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action: ["created", "updated", "deleted", "comment"],
      client_health: ["healthy", "attention", "at_risk"],
      communication_channel: ["whatsapp", "email", "call", "meeting", "other"],
      communication_kind: [
        "update",
        "request",
        "approval",
        "feedback",
        "other",
      ],
      content_format: [
        "reels",
        "carousel",
        "static",
        "stories",
        "video",
        "photo",
        "text",
      ],
      content_front_status: [
        "not_needed",
        "todo",
        "in_progress",
        "missing_material",
        "in_review",
        "changes",
        "done",
      ],
      content_intent: [
        "conversion",
        "growth",
        "authority",
        "connection",
        "sponsored",
      ],
      content_network: ["instagram", "tiktok", "linkedin"],
      content_stage: [
        "production",
        "internal_review",
        "client_review",
        "approved",
        "scheduled",
        "published",
      ],
      deal_stage: ["lead", "contact", "proposal", "negotiation", "won", "lost"],
      decision_status: ["active", "revoked"],
      doc_kind: ["process", "checklist", "policy", "guide"],
      doc_status: ["draft", "active", "review"],
      event_type: ["meeting", "internal", "delivery"],
      finance_account: [
        "client_revenue",
        "other_revenue",
        "owner_contribution",
        "direct_cost",
        "fixed_cost",
        "other_expense",
        "tax",
        "owner_draw",
        "reinvestment",
      ],
      finance_kind: ["income", "expense"],
      lead_source: [
        "referral",
        "instagram",
        "website",
        "google",
        "linkedin",
        "whatsapp",
        "outbound",
        "event",
        "existing_client",
        "other",
      ],
      meeting_item_kind: ["topic", "agreement"],
      meeting_status: ["scheduled", "done", "canceled"],
      project_status: ["planned", "active", "paused", "done", "canceled"],
      task_area: [
        "commercial",
        "finance",
        "operations",
        "brand",
        "technology",
        "clients",
      ],
      task_priority: ["low", "normal", "high"],
      task_status: ["todo", "doing", "done"],
    },
  },
} as const
