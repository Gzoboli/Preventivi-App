// Generated from the Supabase schema (project preventivi-app), then trimmed.
// Regenerate with `supabase gen types typescript` when the schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      catalogue: {
        Row: {
          categoria: string | null
          codice: string
          descrizione: string
          ean: string | null
          fonte: string | null
          id: number
          marca: string
          prezzo_listino_eur: number | null
          serie: string | null
          unita: string | null
        }
        Insert: {
          categoria?: string | null
          codice: string
          descrizione: string
          ean?: string | null
          fonte?: string | null
          id?: never
          marca: string
          prezzo_listino_eur?: number | null
          serie?: string | null
          unita?: string | null
        }
        Update: {
          categoria?: string | null
          codice?: string
          descrizione?: string
          ean?: string | null
          fonte?: string | null
          id?: never
          marca?: string
          prezzo_listino_eur?: number | null
          serie?: string | null
          unita?: string | null
        }
        Relationships: []
      }
      default_price_items: {
        Row: {
          category: string
          code: string
          id: number
          includes_material: boolean
          name: string
          price_eur: number
          sort_order: number
          unit: string
        }
        Insert: {
          category: string
          code: string
          id?: never
          includes_material?: boolean
          name: string
          price_eur: number
          sort_order?: number
          unit?: string
        }
        Update: {
          category?: string
          code?: string
          id?: never
          includes_material?: boolean
          name?: string
          price_eur?: number
          sort_order?: number
          unit?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          brand: string
          discount_pct: number | null
          id: string
          source: string | null
          user_id: string
        }
        Insert: {
          brand: string
          discount_pct?: number | null
          id?: string
          source?: string | null
          user_id?: string
        }
        Update: {
          brand?: string
          discount_pct?: number | null
          id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      edits_log: {
        Row: {
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          line_ref: string | null
          quote_version_id: string | null
          user_id: string
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          line_ref?: string | null
          quote_version_id?: string | null
          user_id?: string
        }
        Update: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          line_ref?: string | null
          quote_version_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'edits_log_quote_version_id_fkey'
            columns: ['quote_version_id']
            isOneToOne: false
            referencedRelation: 'quote_versions'
            referencedColumns: ['id']
          },
        ]
      }
      price_items: {
        Row: {
          category: string | null
          code: string
          created_at: string
          id: string
          includes_material: boolean
          name: string
          notes: string | null
          price_eur: number | null
          sort_order: number
          unit: string
          user_id: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          id?: string
          includes_material?: boolean
          name: string
          notes?: string | null
          price_eur?: number | null
          sort_order?: number
          unit?: string
          user_id?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          includes_material?: boolean
          name?: string
          notes?: string | null
          price_eur?: number | null
          sort_order?: number
          unit?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accent_color: string | null
          address: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          legal_form: string | null
          logo_path: string | null
          method_notes: string | null
          onboarding_answers: Json
          onboarding_completed: boolean
          phone: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id: string
          legal_form?: string | null
          logo_path?: string | null
          method_notes?: string | null
          onboarding_answers?: Json
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_form?: string | null
          logo_path?: string | null
          method_notes?: string | null
          onboarding_answers?: Json
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      quote_files: {
        Row: {
          file_name: string | null
          id: string
          kind: string | null
          mime_type: string | null
          quote_id: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_name?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          quote_id: string
          storage_path: string
          uploaded_at?: string
          user_id?: string
        }
        Update: {
          file_name?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          quote_id?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quote_files_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          },
        ]
      }
      quote_versions: {
        Row: {
          ai_output: Json | null
          clarifications: Json
          created_at: string
          error_message: string | null
          feedback: string | null
          id: string
          input_text: string | null
          quote_id: string
          rating: number | null
          rating_comment: string | null
          run_started_at: string | null
          status: string
          totals: Json | null
          transcripts: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          ai_output?: Json | null
          clarifications?: Json
          created_at?: string
          error_message?: string | null
          feedback?: string | null
          id?: string
          input_text?: string | null
          quote_id: string
          rating?: number | null
          rating_comment?: string | null
          run_started_at?: string | null
          status?: string
          totals?: Json | null
          transcripts?: Json
          updated_at?: string
          user_id?: string
          version: number
        }
        Update: {
          ai_output?: Json | null
          clarifications?: Json
          created_at?: string
          error_message?: string | null
          feedback?: string | null
          id?: string
          input_text?: string | null
          quote_id?: string
          rating?: number | null
          rating_comment?: string | null
          run_started_at?: string | null
          status?: string
          totals?: Json | null
          transcripts?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quote_versions_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          },
        ]
      }
      quotes: {
        Row: {
          client_address: string | null
          client_name: string | null
          created_at: string
          estimated_days: number | null
          id: string
          job_title: string | null
          quote_number: number
          quote_year: number
          selected_tier: string | null
          show_unit_prices: boolean
          status: string
          updated_at: string
          user_id: string
          vat_rate: number
        }
        Insert: {
          client_address?: string | null
          client_name?: string | null
          created_at?: string
          estimated_days?: number | null
          id?: string
          job_title?: string | null
          quote_number?: number
          quote_year?: number
          selected_tier?: string | null
          show_unit_prices?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          vat_rate?: number
        }
        Update: {
          client_address?: string | null
          client_name?: string | null
          created_at?: string
          estimated_days?: number | null
          id?: string
          job_title?: string | null
          quote_number?: number
          quote_year?: number
          selected_tier?: string | null
          show_unit_prices?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          vat_rate?: number
        }
        Relationships: []
      }
      series_uplift: {
        Row: {
          id: number
          marca: string
          plate_style: string | null
          serie: string
          short_description: string | null
          tier_hint: string | null
          uplift_per_point_eur: number | null
        }
        Insert: {
          id?: never
          marca: string
          plate_style?: string | null
          serie: string
          short_description?: string | null
          tier_hint?: string | null
          uplift_per_point_eur?: number | null
        }
        Update: {
          id?: never
          marca?: string
          plate_style?: string | null
          serie?: string
          short_description?: string | null
          tier_hint?: string | null
          uplift_per_point_eur?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      init_my_price_items: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicTables = Database['public']['Tables']

export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']

// Convenience aliases
export type Profile = Tables<'profiles'>
export type PriceItem = Tables<'price_items'>
export type Discount = Tables<'discounts'>
export type Quote = Tables<'quotes'>
export type QuoteVersion = Tables<'quote_versions'>
export type QuoteFile = Tables<'quote_files'>
export type CatalogueItem = Tables<'catalogue'>
export type SeriesUplift = Tables<'series_uplift'>

// Column values constrained by CHECK constraints in the DB
export type QuoteStatus = 'bozza' | 'inviato'
export type QuoteTier = 'base' | 'media' | 'top'
export type VersionStatus = 'processing' | 'needs_answers' | 'ready' | 'error'
export type VatRate = 4 | 10 | 22
