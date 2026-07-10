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
      email_templates: {
        Row: {
          betreff: string
          body_html: string | null
          body_text: string
          erstellt_am: string
          id: string
          is_default: boolean
          mode: string
          sprache: string
          updated_at: string
          zielgruppe: string
        }
        Insert: {
          betreff: string
          body_html?: string | null
          body_text: string
          erstellt_am?: string
          id?: string
          is_default?: boolean
          mode?: string
          sprache?: string
          updated_at?: string
          zielgruppe: string
        }
        Update: {
          betreff?: string
          body_html?: string | null
          body_text?: string
          erstellt_am?: string
          id?: string
          is_default?: boolean
          mode?: string
          sprache?: string
          updated_at?: string
          zielgruppe?: string
        }
        Relationships: []
      }
      gmail_labels: {
        Row: {
          created_at: string
          fachgebiet: string
          id: string
          label_id: string
          label_name: string
          land: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fachgebiet: string
          id?: string
          label_id: string
          label_name: string
          land: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fachgebiet?: string
          id?: string
          label_id?: string
          label_name?: string
          land?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_sync_state: {
        Row: {
          id: number
          last_bounce_check_at: string | null
          last_full_sync_at: string | null
          last_inbox_check_at: string | null
          last_sent_check_at: string | null
          last_summary: Json | null
          updated_at: string
        }
        Insert: {
          id?: number
          last_bounce_check_at?: string | null
          last_full_sync_at?: string | null
          last_inbox_check_at?: string | null
          last_sent_check_at?: string | null
          last_summary?: Json | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_bounce_check_at?: string | null
          last_full_sync_at?: string | null
          last_inbox_check_at?: string | null
          last_sent_check_at?: string | null
          last_summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      gmaps_tick_state: {
        Row: {
          id: number
          last_run_at: string | null
          last_summary: Json | null
          plz_idx: number
          source_idx: number
          updated_at: string
          zielgruppe_idx: number
        }
        Insert: {
          id?: number
          last_run_at?: string | null
          last_summary?: Json | null
          plz_idx?: number
          source_idx?: number
          updated_at?: string
          zielgruppe_idx?: number
        }
        Update: {
          id?: number
          last_run_at?: string | null
          last_summary?: Json | null
          plz_idx?: number
          source_idx?: number
          updated_at?: string
          zielgruppe_idx?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          bounced_at: string | null
          email: string
          erstellt_am: string
          fachgebiet: string | null
          gerichtsgutachter: boolean
          gmail_draft_id: string | null
          gmail_label_id: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          land: string
          last_contacted_at: string | null
          last_replied_at: string | null
          mode: string
          name: string | null
          notiz: string | null
          outlook_folder_id: string | null
          outlook_message_id: string | null
          qualitaet_score: number
          qualitaets_merkmale: string[]
          quelle_typ: string | null
          quelle_url: string | null
          stadt: string | null
          status: string
          telefon: string | null
          updated_at: string
          website: string | null
          zielgruppe: string | null
        }
        Insert: {
          bounced_at?: string | null
          email: string
          erstellt_am?: string
          fachgebiet?: string | null
          gerichtsgutachter?: boolean
          gmail_draft_id?: string | null
          gmail_label_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          land: string
          last_contacted_at?: string | null
          last_replied_at?: string | null
          mode?: string
          name?: string | null
          notiz?: string | null
          outlook_folder_id?: string | null
          outlook_message_id?: string | null
          qualitaet_score?: number
          qualitaets_merkmale?: string[]
          quelle_typ?: string | null
          quelle_url?: string | null
          stadt?: string | null
          status?: string
          telefon?: string | null
          updated_at?: string
          website?: string | null
          zielgruppe?: string | null
        }
        Update: {
          bounced_at?: string | null
          email?: string
          erstellt_am?: string
          fachgebiet?: string | null
          gerichtsgutachter?: boolean
          gmail_draft_id?: string | null
          gmail_label_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          land?: string
          last_contacted_at?: string | null
          last_replied_at?: string | null
          mode?: string
          name?: string | null
          notiz?: string | null
          outlook_folder_id?: string | null
          outlook_message_id?: string | null
          qualitaet_score?: number
          qualitaets_merkmale?: string[]
          quelle_typ?: string | null
          quelle_url?: string | null
          stadt?: string | null
          status?: string
          telefon?: string | null
          updated_at?: string
          website?: string | null
          zielgruppe?: string | null
        }
        Relationships: []
      }
      outlook_folders: {
        Row: {
          created_at: string
          fachgebiet: string
          folder_id: string
          folder_path: string | null
          id: string
          land: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fachgebiet: string
          folder_id: string
          folder_path?: string | null
          id?: string
          land: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fachgebiet?: string
          folder_id?: string
          folder_path?: string | null
          id?: string
          land?: string
          updated_at?: string
        }
        Relationships: []
      }
      outlook_sync_state: {
        Row: {
          id: number
          last_bounce_check_at: string | null
          last_full_sync_at: string | null
          last_inbox_check_at: string | null
          last_sent_check_at: string | null
          last_summary: Json | null
          updated_at: string
        }
        Insert: {
          id?: number
          last_bounce_check_at?: string | null
          last_full_sync_at?: string | null
          last_inbox_check_at?: string | null
          last_sent_check_at?: string | null
          last_summary?: Json | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_bounce_check_at?: string | null
          last_full_sync_at?: string | null
          last_inbox_check_at?: string | null
          last_sent_check_at?: string | null
          last_summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      search_jobs: {
        Row: {
          aktiv: boolean
          erstellt_am: string
          fachgebiet: string
          gerichtsgutachter: boolean
          id: string
          land: string
          last_hit_count: number | null
          last_run_at: string | null
          mode: string
          ort: string | null
          updated_at: string
          zielgruppen: string[]
        }
        Insert: {
          aktiv?: boolean
          erstellt_am?: string
          fachgebiet: string
          gerichtsgutachter?: boolean
          id?: string
          land: string
          last_hit_count?: number | null
          last_run_at?: string | null
          mode?: string
          ort?: string | null
          updated_at?: string
          zielgruppen?: string[]
        }
        Update: {
          aktiv?: boolean
          erstellt_am?: string
          fachgebiet?: string
          gerichtsgutachter?: boolean
          id?: string
          land?: string
          last_hit_count?: number | null
          last_run_at?: string | null
          mode?: string
          ort?: string | null
          updated_at?: string
          zielgruppen?: string[]
        }
        Relationships: []
      }
      search_runs: {
        Row: {
          errors: string | null
          finished_at: string | null
          id: string
          jobs_run: number
          new_leads: number
          started_at: string
        }
        Insert: {
          errors?: string | null
          finished_at?: string | null
          id?: string
          jobs_run?: number
          new_leads?: number
          started_at?: string
        }
        Update: {
          errors?: string | null
          finished_at?: string | null
          id?: string
          jobs_run?: number
          new_leads?: number
          started_at?: string
        }
        Relationships: []
      }
      source_searches: {
        Row: {
          error: string | null
          erstellt_am: string
          fachgebiet: string
          found: number
          id: string
          inserted: number
          land: string
          mode: string
          ok: boolean
          ort: string | null
          params: Json
          quelle: string
          skipped: number
        }
        Insert: {
          error?: string | null
          erstellt_am?: string
          fachgebiet: string
          found?: number
          id?: string
          inserted?: number
          land?: string
          mode?: string
          ok?: boolean
          ort?: string | null
          params?: Json
          quelle: string
          skipped?: number
        }
        Update: {
          error?: string | null
          erstellt_am?: string
          fachgebiet?: string
          found?: number
          id?: string
          inserted?: number
          land?: string
          mode?: string
          ok?: boolean
          ort?: string | null
          params?: Json
          quelle?: string
          skipped?: number
        }
        Relationships: []
      }
      tender_portals: {
        Row: {
          aktiv: boolean
          anmelde_hinweis: string | null
          erstellt_am: string
          homepage: string | null
          id: string
          land: string
          name: string
          region: string | null
          slug: string
          status: string
          such_url_vorlage: string | null
          updated_at: string
          verbindungstyp: string
          wichtigkeit: number
        }
        Insert: {
          aktiv?: boolean
          anmelde_hinweis?: string | null
          erstellt_am?: string
          homepage?: string | null
          id?: string
          land: string
          name: string
          region?: string | null
          slug: string
          status?: string
          such_url_vorlage?: string | null
          updated_at?: string
          verbindungstyp?: string
          wichtigkeit?: number
        }
        Update: {
          aktiv?: boolean
          anmelde_hinweis?: string | null
          erstellt_am?: string
          homepage?: string | null
          id?: string
          land?: string
          name?: string
          region?: string | null
          slug?: string
          status?: string
          such_url_vorlage?: string | null
          updated_at?: string
          verbindungstyp?: string
          wichtigkeit?: number
        }
        Relationships: []
      }
      tender_search_jobs: {
        Row: {
          aktiv: boolean
          cpv_codes: string[]
          erstellt_am: string
          id: string
          laender: string[]
          last_hit_count: number | null
          last_run_at: string | null
          mode: string
          name: string
          schlagworte: string[]
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          cpv_codes?: string[]
          erstellt_am?: string
          id?: string
          laender?: string[]
          last_hit_count?: number | null
          last_run_at?: string | null
          mode?: string
          name: string
          schlagworte?: string[]
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          cpv_codes?: string[]
          erstellt_am?: string
          id?: string
          laender?: string[]
          last_hit_count?: number | null
          last_run_at?: string | null
          mode?: string
          name?: string
          schlagworte?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tenders: {
        Row: {
          auftraggeber: string | null
          beschreibung: string | null
          cpv: string | null
          extern_id: string
          frist: string | null
          gefunden_am: string
          id: string
          land: string | null
          mode: string
          notiz: string | null
          portal_slug: string
          qualitaet_score: number
          status: string
          titel: string
          updated_at: string
          url: string | null
          waehrung: string | null
          wert: number | null
        }
        Insert: {
          auftraggeber?: string | null
          beschreibung?: string | null
          cpv?: string | null
          extern_id: string
          frist?: string | null
          gefunden_am?: string
          id?: string
          land?: string | null
          mode?: string
          notiz?: string | null
          portal_slug: string
          qualitaet_score?: number
          status?: string
          titel: string
          updated_at?: string
          url?: string | null
          waehrung?: string | null
          wert?: number | null
        }
        Update: {
          auftraggeber?: string | null
          beschreibung?: string | null
          cpv?: string | null
          extern_id?: string
          frist?: string | null
          gefunden_am?: string
          id?: string
          land?: string | null
          mode?: string
          notiz?: string | null
          portal_slug?: string
          qualitaet_score?: number
          status?: string
          titel?: string
          updated_at?: string
          url?: string | null
          waehrung?: string | null
          wert?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
