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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      collections: {
        Row: {
          collection_name: string
          created_at: string
          id: string
          items: Json | null
          source_refs: Json | null
          status: string
          time_window: Json | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          collection_name: string
          created_at?: string
          id?: string
          items?: Json | null
          source_refs?: Json | null
          status?: string
          time_window?: Json | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          collection_name?: string
          created_at?: string
          id?: string
          items?: Json | null
          source_refs?: Json | null
          status?: string
          time_window?: Json | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          date: string | null
          description: string
          id: string
          notes: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string | null
          description: string
          id?: string
          notes?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string | null
          description?: string
          id?: string
          notes?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          accommodation_options: Json | null
          activities: Json | null
          created_at: string
          date: string | null
          day_number: number
          id: string
          location_context: string | null
          transportation_segments: Json | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          accommodation_options?: Json | null
          activities?: Json | null
          created_at?: string
          date?: string | null
          day_number: number
          id?: string
          location_context?: string | null
          transportation_segments?: Json | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          accommodation_options?: Json | null
          activities?: Json | null
          created_at?: string
          date?: string | null
          day_number?: number
          id?: string
          location_context?: string | null
          transportation_segments?: Json | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          context_links: string[] | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          object_link: string | null
          reminders: Json | null
          status: string
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          context_links?: string[] | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          object_link?: string | null
          reminders?: Json | null
          status?: string
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          context_links?: string[] | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          object_link?: string | null
          reminders?: Json | null
          status?: string
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      points_of_interest: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          id: string
          is_cancelled: boolean | null
          location: Json | null
          name: string
          source_refs: Json | null
          status: string
          sub_category: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          id?: string
          is_cancelled?: boolean | null
          location?: Json | null
          name: string
          source_refs?: Json | null
          status?: string
          sub_category?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          is_cancelled?: boolean | null
          location?: Json | null
          name?: string
          source_refs?: Json | null
          status?: string
          sub_category?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_of_interest_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      source_emails: {
        Row: {
          created_at: string
          email_id: string | null
          id: string
          linked_entities: Json | null
          parsed_data: Json | null
          source_email_info: Json | null
          status: string
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_id?: string | null
          id?: string
          linked_entities?: Json | null
          parsed_data?: Json | null
          source_email_info?: Json | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_id?: string | null
          id?: string
          linked_entities?: Json | null
          parsed_data?: Json | null
          source_email_info?: Json | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_emails_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      source_recommendations: {
        Row: {
          analysis: Json | null
          created_at: string
          id: string
          linked_entities: Json | null
          recommendation_id: string | null
          source_image: string | null
          source_title: string | null
          source_url: string | null
          status: string
          timestamp: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          id?: string
          linked_entities?: Json | null
          recommendation_id?: string | null
          source_image?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: string
          timestamp?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          id?: string
          linked_entities?: Json | null
          recommendation_id?: string | null
          source_image?: string | null
          source_title?: string | null
          source_url?: string | null
          status?: string
          timestamp?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_recommendations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      transportation: {
        Row: {
          additional_info: Json | null
          booking: Json | null
          category: string
          cost: Json | null
          created_at: string
          id: string
          is_cancelled: boolean | null
          segments: Json | null
          source_refs: Json | null
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          additional_info?: Json | null
          booking?: Json | null
          category: string
          cost?: Json | null
          created_at?: string
          id?: string
          is_cancelled?: boolean | null
          segments?: Json | null
          source_refs?: Json | null
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          additional_info?: Json | null
          booking?: Json | null
          category?: string
          cost?: Json | null
          created_at?: string
          id?: string
          is_cancelled?: boolean | null
          segments?: Json | null
          source_refs?: Json | null
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transportation_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          countries: string[] | null
          created_at: string
          currency: string
          description: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          countries?: string[] | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          countries?: string[] | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_trip: { Args: { _trip_id: string }; Returns: boolean }
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
