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
      ai_usage: {
        Row: {
          count: number
          feature: string
          usage_date: string
          user_id: string
        }
        Insert: {
          count?: number
          feature: string
          usage_date?: string
          user_id: string
        }
        Update: {
          count?: number
          feature?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
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
      contacts: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string
          trip_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string
          trip_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
          trip_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          name: string
          notes: string | null
          storage_path: string
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name: string
          notes?: string | null
          storage_path: string
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name?: string
          notes?: string | null
          storage_path?: string
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_trip_id_fkey"
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
          is_paid: boolean
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
          is_paid?: boolean
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
          is_paid?: boolean
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
          transportation_segments: Json | null
          trip_id: string
          trip_place_id: string | null
          updated_at: string
        }
        Insert: {
          accommodation_options?: Json | null
          activities?: Json | null
          created_at?: string
          date?: string | null
          day_number: number
          id?: string
          transportation_segments?: Json | null
          trip_id: string
          trip_place_id?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_options?: Json | null
          activities?: Json | null
          created_at?: string
          date?: string | null
          day_number?: number
          id?: string
          transportation_segments?: Json | null
          trip_id?: string
          trip_place_id?: string | null
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
          {
            foreignKeyName: "itinerary_days_trip_place_id_fkey"
            columns: ["trip_place_id"]
            isOneToOne: false
            referencedRelation: "trip_places"
            referencedColumns: ["id"]
          },
        ]
      }
      map_list_items: {
        Row: {
          id: string
          list_id: string
          place_key: string
          place_name: string | null
          synced_at: string | null
        }
        Insert: {
          id?: string
          list_id: string
          place_key: string
          place_name?: string | null
          synced_at?: string | null
        }
        Update: {
          id?: string
          list_id?: string
          place_key?: string
          place_name?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "map_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      map_lists: {
        Row: {
          created_at: string | null
          id: string
          item_count: number | null
          last_synced_at: string | null
          name: string
          trip_id: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          last_synced_at?: string | null
          name: string
          trip_id: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          last_synced_at?: string | null
          name?: string
          trip_id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_lists_trip_id_fkey"
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
      pipeline_events: {
        Row: {
          created_at: string | null
          id: string
          image: string | null
          job_id: string
          metadata: Json | null
          source_type: string | null
          source_url: string | null
          stage: string
          status: string
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image?: string | null
          job_id: string
          metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          stage: string
          status?: string
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image?: string | null
          job_id?: string
          metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          stage?: string
          status?: string
          title?: string | null
        }
        Relationships: []
      }
      points_of_interest: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          id: string
          image_url: string | null
          is_cancelled: boolean | null
          is_paid: boolean
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
          image_url?: string | null
          is_cancelled?: boolean | null
          is_paid?: boolean
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
          image_url?: string | null
          is_cancelled?: boolean | null
          is_paid?: boolean
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
      profiles: {
        Row: {
          created_at: string | null
          id: string
          preferred_language: string | null
          user_tier: string
        }
        Insert: {
          created_at?: string | null
          id: string
          preferred_language?: string | null
          user_tier?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          preferred_language?: string | null
          user_tier?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: []
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
          error: string | null
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
          error?: string | null
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
          error?: string | null
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
          is_paid: boolean
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
          is_paid?: boolean
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
          is_paid?: boolean
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
      trip_locations: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          name: string
          notes: string
          parent_id: string | null
          site_type: string
          sort_order: number
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          notes?: string
          parent_id?: string | null
          site_type: string
          sort_order?: number
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          notes?: string
          parent_id?: string | null
          site_type?: string
          sort_order?: number
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "trip_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_places: {
        Row: {
          created_at: string
          id: string
          image_url: string
          notes: string
          potential_activity_ids: Json
          sort_order: number
          trip_id: string
          trip_location_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string
          notes?: string
          potential_activity_ids?: Json
          sort_order?: number
          trip_id: string
          trip_location_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          notes?: string
          potential_activity_ids?: Json
          sort_order?: number
          trip_id?: string
          trip_location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_trip_location_id_fkey"
            columns: ["trip_location_id"]
            isOneToOne: false
            referencedRelation: "trip_locations"
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
          end_date: string | null
          id: string
          name: string
          number_of_days: number | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          countries?: string[] | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          number_of_days?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          countries?: string[] | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          number_of_days?: number | null
          start_date?: string | null
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
      whatsapp_link_codes: {
        Row: {
          code: string
          expires_at: string
          used: boolean | null
          user_id: string
          webhook_token: string
        }
        Insert: {
          code: string
          expires_at: string
          used?: boolean | null
          user_id: string
          webhook_token: string
        }
        Update: {
          code?: string
          expires_at?: string
          used?: boolean | null
          user_id?: string
          webhook_token?: string
        }
        Relationships: []
      }
      whatsapp_users: {
        Row: {
          active_trip_id: string | null
          created_at: string | null
          display_name: string | null
          id: string
          last_message_at: string | null
          linked_at: string | null
          phone_number: string
          user_id: string
          webhook_token: string | null
        }
        Insert: {
          active_trip_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_message_at?: string | null
          linked_at?: string | null
          phone_number: string
          user_id: string
          webhook_token?: string | null
        }
        Update: {
          active_trip_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_message_at?: string | null
          linked_at?: string | null
          phone_number?: string
          user_id?: string
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_users_active_trip_id_fkey"
            columns: ["active_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_increment_usage: {
        Args: { p_feature: string; p_user_id: string }
        Returns: Json
      }
      cleanup_expired_whatsapp_codes: { Args: never; Returns: undefined }
      generate_whatsapp_code: { Args: never; Returns: Json }
      get_usage_summary: { Args: { p_user_id: string }; Returns: Json }
      get_user_id_by_email: { Args: { lookup_email: string }; Returns: string }
      get_webhook_token_by_email: { Args: { p_email: string }; Returns: string }
      has_trip_access: { Args: { _trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { _trip_id: string }; Returns: boolean }
      link_whatsapp: {
        Args: { p_code: string; p_display_name?: string; p_phone: string }
        Returns: Json
      }
      owns_trip: { Args: { _trip_id: string }; Returns: boolean }
      seed_trip_locations: {
        Args: { p_locations: Json; p_parent_id?: string; p_trip_id: string }
        Returns: undefined
      }
      update_user_tier: {
        Args: { p_tier: string; p_user_id: string }
        Returns: Json
      }
      user_trip_ids: { Args: never; Returns: string[] }
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
