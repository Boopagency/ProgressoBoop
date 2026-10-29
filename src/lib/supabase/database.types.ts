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
    PostgrestVersion: "14.17"
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
      channel_members: {
        Row: {
          channel_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          archived: boolean
          client_id: string | null
          client_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name: string | null
        }
        Insert: {
          archived?: boolean
          client_id?: string | null
          client_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["channel_kind"]
          name?: string | null
        }
        Update: {
          archived?: boolean
          client_id?: string | null
          client_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["channel_kind"]
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_files: {
        Row: {
          category: Database["public"]["Enums"]["client_file_category"]
          client_id: string
          client_visible: boolean
          created_at: string
          created_by: string
          description: string | null
          file_name: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["client_file_category"]
          client_id: string
          client_visible?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          file_name: string
          id?: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["client_file_category"]
          client_id?: string
          client_visible?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          name?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          avatar_path: string | null
          client_id: string
          created_at: string
          created_by: string
          email: string
          full_name: string
          id: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          client_id: string
          created_at?: string
          created_by?: string
          email: string
          full_name: string
          id?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          email?: string
          full_name?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          actor_name: string | null
          body: string | null
          channel_id: string | null
          client_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["client_notification_kind"]
          link: string
          message_id: string | null
          post_id: string | null
          project_id: string | null
          read_at: string | null
          task_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          actor_name?: string | null
          body?: string | null
          channel_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["client_notification_kind"]
          link: string
          message_id?: string | null
          post_id?: string | null
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          actor_name?: string | null
          body?: string | null
          channel_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["client_notification_kind"]
          link?: string
          message_id?: string | null
          post_id?: string | null
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          auto_publish: boolean
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
          instagram_media_id: string | null
          instagram_permalink: string | null
          intents: Database["public"]["Enums"]["content_intent"][]
          networks: Database["public"]["Enums"]["content_network"][]
          owner_id: string | null
          pinned: boolean
          project_id: string | null
          publish_attempted_at: string | null
          publish_attempts: number
          publish_error: string | null
          publish_jpeg_paths: string[]
          publish_on: string | null
          publish_status: string | null
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
          auto_publish?: boolean
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
          instagram_media_id?: string | null
          instagram_permalink?: string | null
          intents?: Database["public"]["Enums"]["content_intent"][]
          networks?: Database["public"]["Enums"]["content_network"][]
          owner_id?: string | null
          pinned?: boolean
          project_id?: string | null
          publish_attempted_at?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_jpeg_paths?: string[]
          publish_on?: string | null
          publish_status?: string | null
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
          auto_publish?: boolean
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
          instagram_media_id?: string | null
          instagram_permalink?: string | null
          intents?: Database["public"]["Enums"]["content_intent"][]
          networks?: Database["public"]["Enums"]["content_network"][]
          owner_id?: string | null
          pinned?: boolean
          project_id?: string | null
          publish_attempted_at?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_jpeg_paths?: string[]
          publish_on?: string | null
          publish_status?: string | null
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
          referred_by_client_id: string | null
          service: string | null
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["deal_stage"]
          term_months: number | null
          title: string
          updated_at: string
          utm: Json | null
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
          referred_by_client_id?: string | null
          service?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          term_months?: number | null
          title: string
          updated_at?: string
          utm?: Json | null
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
          referred_by_client_id?: string | null
          service?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          term_months?: number | null
          title?: string
          updated_at?: string
          utm?: Json | null
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
          {
            foreignKeyName: "deals_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      message_audio: {
        Row: {
          created_at: string
          duration_ms: number
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_audio_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          body: string
          channel_id: string
          created_at: string
          edited_at: string | null
          id: string
          internal: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          post_id: string | null
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          task_id: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          channel_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          internal?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          post_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          channel_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          internal?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          post_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          body: string | null
          channel_id: string | null
          client_id: string | null
          created_at: string
          id: string
          item_count: number
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string
          message_id: string | null
          post_id: string | null
          read_at: string | null
          task_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          channel_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          item_count?: number
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string
          message_id?: string | null
          post_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          body?: string | null
          channel_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          item_count?: number
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string
          message_id?: string | null
          post_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          receives_referrals: boolean
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          receives_referrals?: boolean
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          receives_referrals?: boolean
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device: string | null
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device?: string | null
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device?: string | null
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
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
      social_accounts: {
        Row: {
          account_type: string
          app_user_id: string | null
          client_id: string
          connected_at: string
          connected_by: string | null
          connected_by_name: string
          display_name: string | null
          external_user_id: string
          id: string
          last_error: string | null
          network: string
          permissions: string[]
          profile_picture_url: string | null
          status: string
          token_expires_at: string
          token_refreshed_at: string
          updated_at: string
          username: string
        }
        Insert: {
          account_type: string
          app_user_id?: string | null
          client_id: string
          connected_at?: string
          connected_by?: string | null
          connected_by_name: string
          display_name?: string | null
          external_user_id: string
          id?: string
          last_error?: string | null
          network?: string
          permissions?: string[]
          profile_picture_url?: string | null
          status?: string
          token_expires_at: string
          token_refreshed_at?: string
          updated_at?: string
          username: string
        }
        Update: {
          account_type?: string
          app_user_id?: string | null
          client_id?: string
          connected_at?: string
          connected_by?: string | null
          connected_by_name?: string
          display_name?: string | null
          external_user_id?: string
          id?: string
          last_error?: string | null
          network?: string
          permissions?: string[]
          profile_picture_url?: string | null
          status?: string
          token_expires_at?: string
          token_refreshed_at?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      task_deliverables: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          task_id: string
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id: string
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_deliverables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_deliverables_task_id_fkey"
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
          client_approval:
            | Database["public"]["Enums"]["client_approval_result"]
            | null
          client_approval_at: string | null
          client_approval_by: string | null
          client_approval_note: string | null
          client_approval_required: boolean
          client_id: string | null
          client_review_id: string | null
          client_visible: boolean
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
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_approval?:
            | Database["public"]["Enums"]["client_approval_result"]
            | null
          client_approval_at?: string | null
          client_approval_by?: string | null
          client_approval_note?: string | null
          client_approval_required?: boolean
          client_id?: string | null
          client_review_id?: string | null
          client_visible?: boolean
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
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["task_area"] | null
          client_approval?:
            | Database["public"]["Enums"]["client_approval_result"]
            | null
          client_approval_at?: string | null
          client_approval_by?: string | null
          client_approval_note?: string | null
          client_approval_required?: boolean
          client_id?: string | null
          client_review_id?: string | null
          client_visible?: boolean
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
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_instagram_publish: {
        Args: { p_post_id: string }
        Returns: string[]
      }
      channel_counts: {
        Args: never
        Returns: {
          channel_id: string
          last_message_at: string
          pending: number
          unread: number
        }[]
      }
      create_client_account: {
        Args: {
          member_email: string
          member_name: string
          target_client: string
          temp_password: string
        }
        Returns: {
          created: boolean
          member_id: string
        }[]
      }
      disconnect_instagram_account: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      forget_push_endpoints: {
        Args: { p_endpoints: string[]; p_secret: string }
        Returns: number
      }
      instagram_account_token: {
        Args: { p_client_id: string; p_secret: string }
        Returns: {
          access_token: string
          account_id: string
          external_user_id: string
        }[]
      }
      instagram_forget_user: {
        Args: { p_secret: string; p_user_id: string }
        Returns: number
      }
      instagram_post_deferred: {
        Args: {
          p_container_id: string
          p_note: string
          p_post_id: string
          p_secret: string
        }
        Returns: undefined
      }
      instagram_post_failed: {
        Args: {
          p_error: string
          p_final: boolean
          p_post_id: string
          p_secret: string
        }
        Returns: string
      }
      instagram_post_published: {
        Args: {
          p_media_id: string
          p_permalink: string
          p_post_id: string
          p_secret: string
        }
        Returns: undefined
      }
      instagram_posts_due: {
        Args: { p_secret: string }
        Returns: {
          caption: string
          client_id: string
          container_created_at: string
          container_id: string
          format: string
          media_urls: string[]
          post_id: string
        }[]
      }
      instagram_token_failed: {
        Args: {
          p_account_id: string
          p_error: string
          p_expired: boolean
          p_secret: string
        }
        Returns: undefined
      }
      instagram_token_refreshed: {
        Args: {
          p_access_token: string
          p_account_id: string
          p_expires_in: number
          p_secret: string
        }
        Returns: undefined
      }
      instagram_tokens_to_refresh: {
        Args: { p_secret: string }
        Returns: {
          access_token: string
          account_id: string
        }[]
      }
      link_client_member: {
        Args: {
          member_email: string
          member_name: string
          target_client: string
        }
        Returns: string
      }
      open_client_direct_channel: {
        Args: { member_id: string }
        Returns: string
      }
      open_direct_channel: { Args: { profile_id: string }; Returns: string }
      portal_channel: {
        Args: { target_client: string }
        Returns: {
          archived: boolean
          channel_id: string
          last_message_at: string
          last_read_at: string
          name: string
          unread: number
        }[]
      }
      portal_channel_messages: {
        Args: { max_count?: number; older_than?: string; target_client: string }
        Returns: {
          author_name: string
          body: string
          created_at: string
          edited_at: string
          from_team: boolean
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          mine: boolean
          post_cover_path: string
          post_format: Database["public"]["Enums"]["content_format"]
          post_id: string
          post_publish_on: string
          post_stage: Database["public"]["Enums"]["content_stage"]
          post_title: string
          project_id: string
          project_name: string
          resolved: boolean
        }[]
      }
      portal_client_file: {
        Args: { target_file: string }
        Returns: {
          file_name: string
          mime_type: string
          storage_path: string
        }[]
      }
      portal_client_files: {
        Args: { target_client: string }
        Returns: {
          category: Database["public"]["Enums"]["client_file_category"]
          created_at: string
          description: string
          file_name: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
        }[]
      }
      portal_client_profile: {
        Args: { target_client: string }
        Returns: {
          avatar_path: string
          client_id: string
          client_name: string
          instagram_bio: string
          instagram_handle: string
        }[]
      }
      portal_direct_channels: {
        Args: { target_client: string }
        Returns: {
          archived: boolean
          channel_id: string
          last_message_at: string
          last_read_at: string
          team_avatar_url: string
          team_name: string
          unread: number
        }[]
      }
      portal_direct_messages: {
        Args: {
          max_count?: number
          older_than?: string
          target_channel: string
        }
        Returns: {
          author_name: string
          body: string
          created_at: string
          edited_at: string
          from_team: boolean
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          mine: boolean
          post_cover_path: string
          post_format: Database["public"]["Enums"]["content_format"]
          post_id: string
          post_publish_on: string
          post_stage: Database["public"]["Enums"]["content_stage"]
          post_title: string
          project_id: string
          project_name: string
          resolved: boolean
        }[]
      }
      portal_my_clients: {
        Args: never
        Returns: {
          avatar_path: string
          client_id: string
          client_name: string
          member_name: string
        }[]
      }
      portal_post_messages: {
        Args: { target_post: string }
        Returns: {
          author_name: string
          body: string
          created_at: string
          edited_at: string
          from_team: boolean
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          mine: boolean
          resolved: boolean
        }[]
      }
      portal_posts: {
        Args: { target_client: string }
        Returns: {
          caption: string
          cover_path: string
          format: Database["public"]["Enums"]["content_format"]
          id: string
          networks: Database["public"]["Enums"]["content_network"][]
          pinned: boolean
          publish_on: string
          publish_time: string
          published_at: string
          slides: Json
          stage: Database["public"]["Enums"]["content_stage"]
          title: string
          updated_at: string
        }[]
      }
      portal_project_messages: {
        Args: { target_project: string }
        Returns: {
          author_name: string
          body: string
          created_at: string
          edited_at: string
          from_team: boolean
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          mine: boolean
          resolved: boolean
        }[]
      }
      portal_project_steps: {
        Args: { target_project: string }
        Returns: {
          completed_at: string
          due_date: string
          id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }[]
      }
      portal_projects: {
        Args: { target_client: string }
        Returns: {
          completed_at: string
          due_on: string
          id: string
          name: string
          starts_on: string
          status: Database["public"]["Enums"]["project_status"]
          tasks_done: number
          tasks_total: number
          template: string
        }[]
      }
      portal_read_channel: {
        Args: { read_until: string; target_client: string }
        Returns: undefined
      }
      portal_read_direct: {
        Args: { read_until: string; target_channel: string }
        Returns: undefined
      }
      portal_refer_lead: {
        Args: {
          referral_company: string
          referral_email: string
          referral_name: string
          referral_note: string
          referral_phone: string
          target_client: string
        }
        Returns: string
      }
      portal_referrals: {
        Args: { target_client: string }
        Returns: {
          company: string
          contact_name: string
          created_at: string
          id: string
          status: string
        }[]
      }
      portal_review_post: {
        Args: { decision: string; note?: string; target_post: string }
        Returns: string
      }
      portal_review_step: {
        Args: { decision: string; note?: string; target_step: string }
        Returns: string
      }
      portal_send_channel_audio: {
        Args: { audio_path: string; duration_ms: number; target_client: string }
        Returns: string
      }
      portal_send_channel_message: {
        Args: { message_body: string; target_client: string }
        Returns: string
      }
      portal_send_direct_audio: {
        Args: {
          audio_path: string
          duration_ms: number
          target_channel: string
        }
        Returns: string
      }
      portal_send_direct_message: {
        Args: { message_body: string; target_channel: string }
        Returns: string
      }
      portal_send_message: {
        Args: { message_body: string; target_post: string }
        Returns: string
      }
      portal_send_project_message: {
        Args: { message_body: string; target_project: string }
        Returns: string
      }
      portal_step_approvals: {
        Args: { target_client: string }
        Returns: {
          approval: Database["public"]["Enums"]["client_approval_result"]
          awaiting: boolean
          completed_at: string
          decided_at: string
          decided_by_name: string
          due_date: string
          id: string
          note: string
          project_id: string
          project_name: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }[]
      }
      portal_step_deliverables: {
        Args: { target_project: string }
        Returns: {
          created_at: string
          file_path: string
          id: string
          kind: string
          mime_type: string
          task_id: string
          title: string
          url: string
        }[]
      }
      portal_update_me: {
        Args: { new_avatar_path: string; new_name: string }
        Returns: undefined
      }
      reset_client_password: {
        Args: { target_member: string; temp_password: string }
        Returns: undefined
      }
      restore_doc_version: {
        Args: { version_id: string; version_text: string }
        Returns: string
      }
      save_instagram_account: {
        Args: {
          p_access_token: string
          p_account_type: string
          p_app_user_id: string
          p_client_id: string
          p_display_name: string
          p_expires_in: number
          p_external_user_id: string
          p_permissions: string[]
          p_profile_picture_url: string
          p_username: string
        }
        Returns: string
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_device?: string
          p_endpoint: string
          p_p256dh: string
        }
        Returns: undefined
      }
      schedule_instagram_publish: {
        Args: {
          p_jpeg_paths: string[]
          p_media_urls: string[]
          p_post_id: string
          p_sources: string[]
          p_urls_expire_at: string
        }
        Returns: string[]
      }
      send_audio_message: {
        Args: {
          audio_path: string
          duration_ms: number
          is_internal?: boolean
          message_kind?: Database["public"]["Enums"]["message_kind"]
          target_channel: string
          target_post?: string
          target_project?: string
        }
        Returns: string
      }
      site_lead: {
        Args: {
          lead_company: string
          lead_name: string
          lead_phone: string
          lead_profile: string
          lead_service: string
          lead_utm: Json
        }
        Returns: undefined
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
      channel_kind: "client" | "internal" | "direct"
      client_approval_result: "approved" | "changes"
      client_file_category:
        | "contract"
        | "briefing"
        | "brand"
        | "report"
        | "other"
      client_health: "healthy" | "attention" | "at_risk"
      client_notification_kind:
        | "team_message"
        | "post_review"
        | "step_approval"
        | "step_done"
        | "file_shared"
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
      message_kind: "text" | "change_request" | "approval" | "system"
      notification_kind:
        | "message"
        | "client_message"
        | "client_approval"
        | "client_change_request"
        | "task_assigned"
        | "client_referral"
        | "site_lead"
        | "instagram_publish_failed"
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
      channel_kind: ["client", "internal", "direct"],
      client_approval_result: ["approved", "changes"],
      client_file_category: [
        "contract",
        "briefing",
        "brand",
        "report",
        "other",
      ],
      client_health: ["healthy", "attention", "at_risk"],
      client_notification_kind: [
        "team_message",
        "post_review",
        "step_approval",
        "step_done",
        "file_shared",
      ],
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
      message_kind: ["text", "change_request", "approval", "system"],
      notification_kind: [
        "message",
        "client_message",
        "client_approval",
        "client_change_request",
        "task_assigned",
        "client_referral",
        "site_lead",
        "instagram_publish_failed",
      ],
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
