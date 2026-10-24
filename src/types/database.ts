export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PolicyDocumentRow = {
  id: string;
  user_id: string;
  title: string;
  source_kind: "upload" | "url";
  source_url: string | null;
  original_filename: string | null;
  byte_size: number;
  sha256: string;
  page_count: number | null;
  status: "uploaded" | "processing" | "ready" | "failed";
  status_detail: string | null;
  pending_ocr_pages: number[];
  ocr_total: number;
  policy_type: "health" | "life" | "motor" | "travel" | "home" | "personal_accident" | "other";
  type_confidence: number | null;
  is_insurance_policy: boolean;
  classification: Json;
  insurer: string | null;
  extraction: Json;
  storage_path: string | null;
  file_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PolicyPageRow = {
  id: string;
  document_id: string;
  user_id: string;
  page_number: number;
  text: string;
  text_source: "text" | "ocr";
};

export type PolicyClauseRow = {
  id: string;
  document_id: string;
  user_id: string;
  clause_index: number;
  clause_ref: string | null;
  heading: string | null;
  section: string | null;
  page_number: number;
  continued: boolean;
  text: string;
};

export type Database = {
  public: {
    Tables: {
      financial_profiles: {
        Row: {
          id: string;
          user_id: string;
          onboarding_step:
            | "country_currency"
            | "employment"
            | "monthly_compensation"
            | "financial_snapshot"
            | "review";
          onboarding_completed: boolean;
          country_code: string | null;
          currency_code: string | null;
          employment_type: string | null;
          ctc_annual: number | null;
          ctc_components: Json;
          monthly_gross_salary: number | null;
          monthly_deductions: Json;
          monthly_take_home_salary: number | null;
          monthly_expenses: Json;
          monthly_savings_target: number | null;
          debts: Json;
          insurances: Json;
          investments: Json;
          goals: Json;
          derived_values: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          onboarding_step?:
            | "country_currency"
            | "employment"
            | "monthly_compensation"
            | "financial_snapshot"
            | "review";
          onboarding_completed?: boolean;
          country_code?: string | null;
          currency_code?: string | null;
          employment_type?: string | null;
          ctc_annual?: number | null;
          ctc_components?: Json;
          monthly_gross_salary?: number | null;
          monthly_deductions?: Json;
          monthly_take_home_salary?: number | null;
          monthly_expenses?: Json;
          monthly_savings_target?: number | null;
          debts?: Json;
          insurances?: Json;
          investments?: Json;
          goals?: Json;
          derived_values?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          onboarding_step?:
            | "country_currency"
            | "employment"
            | "monthly_compensation"
            | "financial_snapshot"
            | "review";
          onboarding_completed?: boolean;
          country_code?: string | null;
          currency_code?: string | null;
          employment_type?: string | null;
          ctc_annual?: number | null;
          ctc_components?: Json;
          monthly_gross_salary?: number | null;
          monthly_deductions?: Json;
          monthly_take_home_salary?: number | null;
          monthly_expenses?: Json;
          monthly_savings_target?: number | null;
          debts?: Json;
          insurances?: Json;
          investments?: Json;
          goals?: Json;
          derived_values?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      policy_documents: {
        Row: PolicyDocumentRow;
        Insert: Partial<PolicyDocumentRow> &
          Pick<PolicyDocumentRow, "user_id" | "title" | "source_kind" | "byte_size" | "sha256">;
        Update: Partial<PolicyDocumentRow>;
        Relationships: [];
      };
      policy_pages: {
        Row: PolicyPageRow;
        Insert: Partial<PolicyPageRow> &
          Pick<PolicyPageRow, "document_id" | "user_id" | "page_number" | "text" | "text_source">;
        Update: Partial<PolicyPageRow>;
        Relationships: [];
      };
      policy_clauses: {
        Row: PolicyClauseRow;
        Insert: Partial<PolicyClauseRow> &
          Pick<PolicyClauseRow, "document_id" | "user_id" | "clause_index" | "page_number" | "text">;
        Update: Partial<PolicyClauseRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
