export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
