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
      leads: {
        Row: {
          email: string
          erstellt_am: string
          fachgebiet: string | null
          gerichtsgutachter: boolean
          id: string
          land: string
          last_contacted_at: string | null
          name: string | null
          notiz: string | null
          outlook_message_id: string | null
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
          email: string
          erstellt_am?: string
          fachgebiet?: string | null
          gerichtsgutachter?: boolean
          id?: string
          land: string
          last_contacted_at?: string | null
          name?: string | null
          notiz?: string | null
          outlook_message_id?: string | null
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
          email?: string
          erstellt_am?: string
          fachgebiet?: string | null
          gerichtsgutachter?: boolean
          id?: string
          land?: string
          last_contacted_at?: string | null
          name?: string | null
          notiz?: string | null
          outlook_message_id?: string | null
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
