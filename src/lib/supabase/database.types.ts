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
      access_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_email: string | null
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_email?: string | null
          user_id: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_email?: string | null
          user_id?: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "access_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          due_at: string | null
          escalation_chain: Json | null
          id: string
          notes: string | null
          reference_id: string
          reference_table: string
          request_type: Database["public"]["Enums"]["approval_request_type"]
          status: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          updated_at: string
          version: number
          workflow_state: Database["public"]["Enums"]["approval_workflow_state"]
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          escalation_chain?: Json | null
          id?: string
          notes?: string | null
          reference_id: string
          reference_table: string
          request_type: Database["public"]["Enums"]["approval_request_type"]
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          updated_at?: string
          version?: number
          workflow_state?: Database["public"]["Enums"]["approval_workflow_state"]
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          escalation_chain?: Json | null
          id?: string
          notes?: string | null
          reference_id?: string
          reference_table?: string
          request_type?: Database["public"]["Enums"]["approval_request_type"]
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by?: string
          updated_at?: string
          version?: number
          workflow_state?: Database["public"]["Enums"]["approval_workflow_state"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_holder: string
          account_number: string
          account_type: string
          bank_name: string
          created_at: string
          created_by: string
          currency: string
          current_balance: number
          gl_account_code: string | null
          id: string
          is_primary: boolean
          notes: string | null
          opening_balance: number
          status: string
          updated_at: string
        }
        Insert: {
          account_holder?: string
          account_number: string
          account_type?: string
          bank_name: string
          created_at?: string
          created_by: string
          currency?: string
          current_balance?: number
          gl_account_code?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          opening_balance?: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_holder?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          created_by?: string
          currency?: string
          current_balance?: number
          gl_account_code?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          opening_balance?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_gl_account_code_fkey"
            columns: ["gl_account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      base_rate_history: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_rate: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          op_margin: number
          quarter: string
          total_paid: number | null
          total_pool: number | null
          version: number
          weighted_cost: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          op_margin: number
          quarter: string
          total_paid?: number | null
          total_pool?: number | null
          version?: number
          weighted_cost: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          op_margin?: number
          quarter?: string
          total_paid?: number | null
          total_pool?: number | null
          version?: number
          weighted_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_rate_history_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name: string
          parent_code: string | null
          sort_order: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          parent_code?: string | null
          sort_order?: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          parent_code?: string | null
          sort_order?: number
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      claims: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          claim_type: Database["public"]["Enums"]["claim_type"]
          claimant_name: string
          company_id: string | null
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          payroll_month: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["claim_status"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          claim_type: Database["public"]["Enums"]["claim_type"]
          claimant_name: string
          company_id?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          payroll_month?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          claim_type?: Database["public"]["Enums"]["claim_type"]
          claimant_name?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          payroll_month?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Relationships: [
          {
            foreignKeyName: "claims_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          short_code: string
          tier: Database["public"]["Enums"]["company_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          short_code: string
          tier: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          short_code?: string
          tier?: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      config_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json
          old_values: Json
          row_key: string
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values: Json
          old_values: Json
          row_key: string
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json
          old_values?: Json
          row_key?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          applied_to_statement_id: string | null
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string
          credit_note_no: string | null
          id: string
          invoice_id: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_to_statement_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by: string
          credit_note_no?: string | null
          id?: string
          invoice_id: string
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_to_statement_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          credit_note_no?: string | null
          id?: string
          invoice_id?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_applied_to_statement_id_fkey"
            columns: ["applied_to_statement_id"]
            isOneToOne: false
            referencedRelation: "monthly_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      dept_pools: {
        Row: {
          amount: number
          approval_id: string | null
          created_at: string
          created_by: string | null
          department_id: string
          description: string | null
          id: string
          period_month: string | null
          transaction_type: Database["public"]["Enums"]["dept_pool_txn_type"]
        }
        Insert: {
          amount: number
          approval_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          period_month?: string | null
          transaction_type: Database["public"]["Enums"]["dept_pool_txn_type"]
        }
        Update: {
          amount?: number
          approval_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          period_month?: string | null
          transaction_type?: Database["public"]["Enums"]["dept_pool_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "dept_pools_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_pools_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests_with_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_pools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_pools_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      director_ctc: {
        Row: {
          allowance: number
          basic: number
          company_id: string
          created_at: string
          created_by: string
          director_id: string
          employer_eis: number | null
          employer_epf: number | null
          employer_socso: number | null
          id: string
          kpi: number
          period_month: string
          total_ctc: number | null
        }
        Insert: {
          allowance?: number
          basic?: number
          company_id: string
          created_at?: string
          created_by: string
          director_id: string
          employer_eis?: number | null
          employer_epf?: number | null
          employer_socso?: number | null
          id?: string
          kpi?: number
          period_month: string
          total_ctc?: number | null
        }
        Update: {
          allowance?: number
          basic?: number
          company_id?: string
          created_at?: string
          created_by?: string
          director_id?: string
          employer_eis?: number | null
          employer_epf?: number | null
          employer_socso?: number | null
          id?: string
          kpi?: number
          period_month?: string
          total_ctc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "director_ctc_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_ctc_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_ctc_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
        ]
      }
      director_payouts: {
        Row: {
          advance_amount: number
          advance_balance: number
          advance_repaid: number
          after_saving: number | null
          calculation_snapshot: Json | null
          created_at: string
          created_by: string | null
          director_id: string
          gross_amount: number | null
          id: string
          invoice_base: number | null
          invoice_bk: number | null
          invoice_eis_er: number | null
          invoice_epf_er: number | null
          invoice_socso_er: number | null
          invoice_total: number | null
          payroll_allow: number | null
          payroll_bk: number | null
          payroll_calc: number | null
          payroll_eis_ee: number | null
          payroll_eis_er: number | null
          payroll_epf_ee: number | null
          payroll_epf_er: number | null
          payroll_gross: number | null
          payroll_net: number | null
          payroll_pcb: number | null
          payroll_socso_ee: number | null
          payroll_socso_er: number | null
          period_month: string
          saving_amount: number | null
          status: Database["public"]["Enums"]["payout_status"]
          statutory_er_in: number | null
          statutory_er_out: number | null
          statutory_surplus: number | null
        }
        Insert: {
          advance_amount?: number
          advance_balance?: number
          advance_repaid?: number
          after_saving?: number | null
          calculation_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          director_id: string
          gross_amount?: number | null
          id?: string
          invoice_base?: number | null
          invoice_bk?: number | null
          invoice_eis_er?: number | null
          invoice_epf_er?: number | null
          invoice_socso_er?: number | null
          invoice_total?: number | null
          payroll_allow?: number | null
          payroll_bk?: number | null
          payroll_calc?: number | null
          payroll_eis_ee?: number | null
          payroll_eis_er?: number | null
          payroll_epf_ee?: number | null
          payroll_epf_er?: number | null
          payroll_gross?: number | null
          payroll_net?: number | null
          payroll_pcb?: number | null
          payroll_socso_ee?: number | null
          payroll_socso_er?: number | null
          period_month: string
          saving_amount?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          statutory_er_in?: number | null
          statutory_er_out?: number | null
          statutory_surplus?: number | null
        }
        Update: {
          advance_amount?: number
          advance_balance?: number
          advance_repaid?: number
          after_saving?: number | null
          calculation_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          director_id?: string
          gross_amount?: number | null
          id?: string
          invoice_base?: number | null
          invoice_bk?: number | null
          invoice_eis_er?: number | null
          invoice_epf_er?: number | null
          invoice_socso_er?: number | null
          invoice_total?: number | null
          payroll_allow?: number | null
          payroll_bk?: number | null
          payroll_calc?: number | null
          payroll_eis_ee?: number | null
          payroll_eis_er?: number | null
          payroll_epf_ee?: number | null
          payroll_epf_er?: number | null
          payroll_gross?: number | null
          payroll_net?: number | null
          payroll_pcb?: number | null
          payroll_socso_ee?: number | null
          payroll_socso_er?: number | null
          period_month?: string
          saving_amount?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          statutory_er_in?: number | null
          statutory_er_out?: number | null
          statutory_surplus?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "director_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_payouts_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
        ]
      }
      directors: {
        Row: {
          children_count: number
          code: string
          created_at: string
          id: string
          min_payout: number
          name: string
          pcb_category: Database["public"]["Enums"]["pcb_category"]
          status: Database["public"]["Enums"]["director_status"]
          tax_ref_no: string | null
          updated_at: string
          weightage: number
        }
        Insert: {
          children_count?: number
          code: string
          created_at?: string
          id?: string
          min_payout: number
          name: string
          pcb_category?: Database["public"]["Enums"]["pcb_category"]
          status?: Database["public"]["Enums"]["director_status"]
          tax_ref_no?: string | null
          updated_at?: string
          weightage: number
        }
        Update: {
          children_count?: number
          code?: string
          created_at?: string
          id?: string
          min_payout?: number
          name?: string
          pcb_category?: Database["public"]["Enums"]["pcb_category"]
          status?: Database["public"]["Enums"]["director_status"]
          tax_ref_no?: string | null
          updated_at?: string
          weightage?: number
        }
        Relationships: []
      }
      eis_act800_schedule: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee: number
          employer: number
          id: number
          wage_from: number
          wage_to: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee: number
          employer: number
          id?: number
          wage_from: number
          wage_to: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee?: number
          employer?: number
          id?: number
          wage_from?: number
          wage_to?: number
        }
        Relationships: []
      }
      epf_third_schedule: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee: number
          employer: number
          id: number
          part: Database["public"]["Enums"]["epf_part"]
          wage_from: number
          wage_to: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee: number
          employer: number
          id?: number
          part?: Database["public"]["Enums"]["epf_part"]
          wage_from: number
          wage_to: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee?: number
          employer?: number
          id?: number
          part?: Database["public"]["Enums"]["epf_part"]
          wage_from?: number
          wage_to?: number
        }
        Relationships: []
      }
      fund_source_repayments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          fund_source_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["repayment_type"]
          payment_voucher_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          fund_source_id: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["repayment_type"]
          payment_voucher_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          fund_source_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["repayment_type"]
          payment_voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_source_repayments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_source_repayments_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_source_outstanding"
            referencedColumns: ["fund_source_id"]
          },
          {
            foreignKeyName: "fund_source_repayments_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_source_repayments_payment_voucher_id_fkey"
            columns: ["payment_voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_sources: {
        Row: {
          amount: number
          capital_type: string
          cost_rate: number
          created_at: string
          created_by: string
          early_withdrawal: boolean
          effective_date: string
          from_company_id: string | null
          from_director_id: string | null
          id: string
          lock_in_months: number | null
          maturity_date: string | null
          notes: string | null
          penalty_on_early: number | null
          repaid_at: string | null
          repaid_by: string | null
          source_type: Database["public"]["Enums"]["fund_source_type"]
          status: Database["public"]["Enums"]["fund_source_status"]
          updated_at: string
          version: number
        }
        Insert: {
          amount: number
          capital_type?: string
          cost_rate: number
          created_at?: string
          created_by: string
          early_withdrawal?: boolean
          effective_date: string
          from_company_id?: string | null
          from_director_id?: string | null
          id?: string
          lock_in_months?: number | null
          maturity_date?: string | null
          notes?: string | null
          penalty_on_early?: number | null
          repaid_at?: string | null
          repaid_by?: string | null
          source_type: Database["public"]["Enums"]["fund_source_type"]
          status?: Database["public"]["Enums"]["fund_source_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number
          capital_type?: string
          cost_rate?: number
          created_at?: string
          created_by?: string
          early_withdrawal?: boolean
          effective_date?: string
          from_company_id?: string | null
          from_director_id?: string | null
          id?: string
          lock_in_months?: number | null
          maturity_date?: string | null
          notes?: string | null
          penalty_on_early?: number | null
          repaid_at?: string | null
          repaid_by?: string | null
          source_type?: Database["public"]["Enums"]["fund_source_type"]
          status?: Database["public"]["Enums"]["fund_source_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_fund_sources_director"
            columns: ["from_director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_sources_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_sources_repaid_by_fkey"
            columns: ["repaid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_cost_submissions: {
        Row: {
          dept_summaries: Json
          id: string
          notes: string | null
          period_month: string
          pool_allocation_snapshot: Json
          staff_allocation_snapshot: Json
          staff_snapshot: Json
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          dept_summaries: Json
          id?: string
          notes?: string | null
          period_month: string
          pool_allocation_snapshot: Json
          staff_allocation_snapshot: Json
          staff_snapshot: Json
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          dept_summaries?: Json
          id?: string
          notes?: string | null
          period_month?: string
          pool_allocation_snapshot?: Json
          staff_allocation_snapshot?: Json
          staff_snapshot?: Json
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_cost_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pool_allocation: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          department_id: string
          id: string
          period_month: string
          split_pct: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          department_id: string
          id?: string
          period_month: string
          split_pct: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          department_id?: string
          id?: string
          period_month?: string
          split_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_pool_allocation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pool_allocation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pool_allocation_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_allocation: {
        Row: {
          allocation_pct: number
          company_id: string
          created_at: string
          created_by: string
          id: string
          period_month: string
          staff_id: string
        }
        Insert: {
          allocation_pct: number
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          period_month: string
          staff_id: string
        }
        Update: {
          allocation_pct?: number
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          period_month?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_allocation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_allocation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_allocation_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_costs: {
        Row: {
          allowances: number
          basic_salary: number
          created_at: string
          created_by: string
          department_id: string
          eis_er: number | null
          employee_name: string
          epf_er: number | null
          id: string
          is_mgmt_fee: boolean
          non_statutory_allowance: number
          socso_er: number | null
          status: Database["public"]["Enums"]["hr_staff_status"]
          total_ctc: number | null
          updated_at: string
        }
        Insert: {
          allowances?: number
          basic_salary: number
          created_at?: string
          created_by: string
          department_id: string
          eis_er?: number | null
          employee_name: string
          epf_er?: number | null
          id?: string
          is_mgmt_fee?: boolean
          non_statutory_allowance?: number
          socso_er?: number | null
          status?: Database["public"]["Enums"]["hr_staff_status"]
          total_ctc?: number | null
          updated_at?: string
        }
        Update: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          created_by?: string
          department_id?: string
          eis_er?: number | null
          employee_name?: string
          epf_er?: number | null
          id?: string
          is_mgmt_fee?: boolean
          non_statutory_allowance?: number
          socso_er?: number | null
          status?: Database["public"]["Enums"]["hr_staff_status"]
          total_ctc?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_costs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      hv_operating_fund: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_table: string | null
          transaction_type: Database["public"]["Enums"]["hv_fund_txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          transaction_type: Database["public"]["Enums"]["hv_fund_txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          transaction_type?: Database["public"]["Enums"]["hv_fund_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "hv_operating_fund_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payout_pool: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          director_id: string | null
          id: string
          release_approved_at: string | null
          release_approved_by: string | null
          transaction_type: Database["public"]["Enums"]["invoice_pool_txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          director_id?: string | null
          id?: string
          release_approved_at?: string | null
          release_approved_by?: string | null
          transaction_type: Database["public"]["Enums"]["invoice_pool_txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          director_id?: string | null
          id?: string
          release_approved_at?: string | null
          release_approved_by?: string | null
          transaction_type?: Database["public"]["Enums"]["invoice_pool_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payout_pool_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payout_pool_release_approved_by_fkey"
            columns: ["release_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base_amount: number | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          company_id: string
          contract_id: string | null
          created_at: string
          created_by: string
          id: string
          invoice_no: string | null
          period_month: string
          sst_amount: number | null
          sst_rate: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
          version: number
        }
        Insert: {
          base_amount?: number | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          company_id: string
          contract_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          invoice_no?: string | null
          period_month: string
          sst_amount?: number | null
          sst_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
          version?: number
        }
        Update: {
          base_amount?: number | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          company_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_no?: string | null
          period_month?: string
          sst_amount?: number | null
          sst_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string
          description: string
          entry_no: string | null
          id: string
          is_reversed: boolean
          period_month: string
          reference_id: string | null
          reference_type: string | null
          reversed_by_id: string | null
          total_amount: number
          transaction_date: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          entry_no?: string | null
          id?: string
          is_reversed?: boolean
          period_month: string
          reference_id?: string | null
          reference_type?: string | null
          reversed_by_id?: string | null
          total_amount: number
          transaction_date: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          entry_no?: string | null
          id?: string
          is_reversed?: boolean
          period_month?: string
          reference_id?: string | null
          reference_type?: string | null
          reversed_by_id?: string | null
          total_amount?: number
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          created_at: string
          credit: number | null
          debit: number | null
          description: string | null
          entry_id: string
          id: string
        }
        Insert: {
          account_code: string
          created_at?: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_id: string
          id?: string
        }
        Update: {
          account_code?: string
          created_at?: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_rate: number
          company_id: string
          created_at: string
          created_by: string
          disbursement_date: string | null
          effective_rate: number
          id: string
          principal: number
          repayment_terms: string | null
          risk_premium: number
          status: Database["public"]["Enums"]["loan_status"]
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate: number
          company_id: string
          created_at?: string
          created_by: string
          disbursement_date?: string | null
          effective_rate: number
          id?: string
          principal: number
          repayment_terms?: string | null
          risk_premium: number
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number
          company_id?: string
          created_at?: string
          created_by?: string
          disbursement_date?: string | null
          effective_rate?: number
          id?: string
          principal?: number
          repayment_terms?: string | null
          risk_premium?: number
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_statement_lines: {
        Row: {
          amount: number
          category_code: string
          created_at: string
          description: string | null
          direction: Database["public"]["Enums"]["statement_direction"]
          id: string
          line_type: Database["public"]["Enums"]["statement_line_type"]
          reference_id: string | null
          reference_table: string | null
          statement_id: string
        }
        Insert: {
          amount: number
          category_code: string
          created_at?: string
          description?: string | null
          direction: Database["public"]["Enums"]["statement_direction"]
          id?: string
          line_type: Database["public"]["Enums"]["statement_line_type"]
          reference_id?: string | null
          reference_table?: string | null
          statement_id: string
        }
        Update: {
          amount?: number
          category_code?: string
          created_at?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["statement_direction"]
          id?: string
          line_type?: Database["public"]["Enums"]["statement_line_type"]
          reference_id?: string | null
          reference_table?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_statement_lines_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "statement_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "monthly_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "monthly_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_statements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          net_amount: number
          period_month: string
          status: Database["public"]["Enums"]["statement_status"]
          total_contra: number
          total_invoice: number
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          net_amount?: number
          period_month: string
          status?: Database["public"]["Enums"]["statement_status"]
          total_contra?: number
          total_invoice?: number
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          net_amount?: number
          period_month?: string
          status?: Database["public"]["Enums"]["statement_status"]
          total_contra?: number
          total_invoice?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_statements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      overdue_config: {
        Row: {
          days_from: number
          days_to: number | null
          id: string
          penalty_rate: number
          stage: Database["public"]["Enums"]["overdue_stage"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          days_from: number
          days_to?: number | null
          id?: string
          penalty_rate: number
          stage: Database["public"]["Enums"]["overdue_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          days_from?: number
          days_to?: number | null
          id?: string
          penalty_rate?: number
          stage?: Database["public"]["Enums"]["overdue_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overdue_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      overdue_records: {
        Row: {
          created_at: string
          id: string
          loan_id: string
          overdue_days: number
          overdue_stage: Database["public"]["Enums"]["overdue_stage"]
          penalty_amount: number | null
          penalty_rate: number | null
          period_month: string
          status: Database["public"]["Enums"]["overdue_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          loan_id: string
          overdue_days: number
          overdue_stage: Database["public"]["Enums"]["overdue_stage"]
          penalty_amount?: number | null
          penalty_rate?: number | null
          period_month: string
          status?: Database["public"]["Enums"]["overdue_status"]
        }
        Update: {
          created_at?: string
          id?: string
          loan_id?: string
          overdue_days?: number
          overdue_stage?: Database["public"]["Enums"]["overdue_stage"]
          penalty_amount?: number | null
          penalty_rate?: number | null
          period_month?: string
          status?: Database["public"]["Enums"]["overdue_status"]
        }
        Relationships: [
          {
            foreignKeyName: "overdue_records_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "overdue_records_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attachments: {
        Row: {
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          voucher_id: string
        }
        Insert: {
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          voucher_id: string
        }
        Update: {
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attachments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_vouchers: {
        Row: {
          amount: number
          approval_id: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          created_at: string
          created_by: string
          currency: string
          description: string
          direction: string
          executed_at: string | null
          executed_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          payee_company_id: string | null
          payee_name: string
          payment_date: string | null
          payment_method: string
          payment_reference: string | null
          reference_id: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["payment_voucher_status"]
          updated_at: string
          version: number
          voucher_no: string | null
          voucher_type: Database["public"]["Enums"]["payment_voucher_type"]
        }
        Insert: {
          amount: number
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description: string
          direction?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payee_company_id?: string | null
          payee_name: string
          payment_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["payment_voucher_status"]
          updated_at?: string
          version?: number
          voucher_no?: string | null
          voucher_type: Database["public"]["Enums"]["payment_voucher_type"]
        }
        Update: {
          amount?: number
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          direction?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payee_company_id?: string | null
          payee_name?: string
          payment_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["payment_voucher_status"]
          updated_at?: string
          version?: number
          voucher_no?: string | null
          voucher_type?: Database["public"]["Enums"]["payment_voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_vouchers_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests_with_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_payee_company_id_fkey"
            columns: ["payee_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pcb_jadual: {
        Row: {
          category: Database["public"]["Enums"]["pcb_category"]
          children: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: number
          income_from: number
          income_to: number
          pcb_amount: number
        }
        Insert: {
          category: Database["public"]["Enums"]["pcb_category"]
          children: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: number
          income_from: number
          income_to: number
          pcb_amount: number
        }
        Update: {
          category?: Database["public"]["Enums"]["pcb_category"]
          children?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: number
          income_from?: number
          income_to?: number
          pcb_amount?: number
        }
        Relationships: []
      }
      period_locks: {
        Row: {
          closed_at: string
          closed_by: string
          id: string
          is_locked: boolean
          notes: string | null
          period_month: string
          reopened_at: string | null
          reopened_by: string | null
        }
        Insert: {
          closed_at?: string
          closed_by: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          period_month: string
          reopened_at?: string | null
          reopened_by?: string | null
        }
        Update: {
          closed_at?: string
          closed_by?: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          period_month?: string
          reopened_at?: string | null
          reopened_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "period_locks_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_locks_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_splits: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_hv_share: boolean
          split_pct: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_hv_share?: boolean
          split_pct: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_hv_share?: boolean
          split_pct?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_splits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      repayments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["repayment_type"]
          reference_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          loan_id: string
          notes?: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["repayment_type"]
          reference_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["repayment_type"]
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repayments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_pool: {
        Row: {
          allowance_ratio: number | null
          basic_ratio: number | null
          created_at: string
          id: string
          kpi_ratio: number | null
          period_month: string
          total_ctc_in: number | null
          total_pool: number | null
          total_saving: number | null
          total_statutory_surplus: number | null
        }
        Insert: {
          allowance_ratio?: number | null
          basic_ratio?: number | null
          created_at?: string
          id?: string
          kpi_ratio?: number | null
          period_month: string
          total_ctc_in?: number | null
          total_pool?: number | null
          total_saving?: number | null
          total_statutory_surplus?: number | null
        }
        Update: {
          allowance_ratio?: number | null
          basic_ratio?: number | null
          created_at?: string
          id?: string
          kpi_ratio?: number | null
          period_month?: string
          total_ctc_in?: number | null
          total_pool?: number | null
          total_saving?: number | null
          total_statutory_surplus?: number | null
        }
        Relationships: []
      }
      service_contracts: {
        Row: {
          amount: number | null
          approved_by: string | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          company_id: string | null
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          end_date: string | null
          id: string
          split_pct: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          approved_by?: string | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          company_id?: string | null
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          split_pct?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          approved_by?: string | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          company_id?: string | null
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          split_pct?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      socso_act4_schedule: {
        Row: {
          category: Database["public"]["Enums"]["socso_category"]
          created_at: string
          effective_from: string
          effective_to: string | null
          employee: number
          employer: number
          id: number
          wage_from: number
          wage_to: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["socso_category"]
          created_at?: string
          effective_from: string
          effective_to?: string | null
          employee: number
          employer: number
          id?: number
          wage_from: number
          wage_to: number
        }
        Update: {
          category?: Database["public"]["Enums"]["socso_category"]
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee?: number
          employer?: number
          id?: number
          wage_from?: number
          wage_to?: number
        }
        Relationships: []
      }
      statement_categories: {
        Row: {
          code: string
          created_at: string
          default_direction: Database["public"]["Enums"]["statement_direction"]
          default_line_type: Database["public"]["Enums"]["statement_line_type"]
          description: string | null
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          default_direction: Database["public"]["Enums"]["statement_direction"]
          default_line_type: Database["public"]["Enums"]["statement_line_type"]
          description?: string | null
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          default_direction?: Database["public"]["Enums"]["statement_direction"]
          default_line_type?: Database["public"]["Enums"]["statement_line_type"]
          description?: string | null
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      tier_config: {
        Row: {
          id: string
          premium_rate: number
          tier: Database["public"]["Enums"]["company_tier"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          premium_rate: number
          tier: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          premium_rate?: number
          tier?: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_config: {
        Row: {
          config_key: string
          config_value: number
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: number
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: number
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          id: string
          is_active?: boolean
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      utility_splits: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_hv_share: boolean
          split_pct: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_hv_share?: boolean
          split_pct: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_hv_share?: boolean
          split_pct?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_splits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      approval_requests_with_target: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          id: string | null
          notes: string | null
          reference_id: string | null
          reference_table: string | null
          request_type:
            | Database["public"]["Enums"]["approval_request_type"]
            | null
          status: Database["public"]["Enums"]["approval_status"] | null
          submitted_by: string | null
          submitted_by_name: string | null
          updated_at: string | null
          workflow_state:
            | Database["public"]["Enums"]["approval_workflow_state"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dept_pool_balances: {
        Row: {
          balance: number | null
          department_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dept_pools_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_source_outstanding: {
        Row: {
          cost_rate: number | null
          effective_date: string | null
          from_company_id: string | null
          from_director_id: string | null
          fund_source_id: string | null
          lock_in_months: number | null
          maturity_date: string | null
          monthly_payment: number | null
          original_amount: number | null
          outstanding: number | null
          source_type: Database["public"]["Enums"]["fund_source_type"] | null
          status: Database["public"]["Enums"]["fund_source_status"] | null
          total_interest_due: number | null
          total_interest_paid: number | null
          total_penalty_paid: number | null
          total_principal_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_fund_sources_director"
            columns: ["from_director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_sources_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_sources_weighted_cost: {
        Row: {
          total_paid_capital: number | null
          weighted_cost_rate: number | null
        }
        Relationships: []
      }
      hv_operating_fund_balance: {
        Row: {
          balance: number | null
        }
        Relationships: []
      }
      invoice_payout_pool_balance: {
        Row: {
          balance: number | null
        }
        Relationships: []
      }
      loan_outstanding: {
        Row: {
          company_id: string | null
          disbursement_date: string | null
          effective_rate: number | null
          loan_id: string | null
          outstanding: number | null
          principal: number | null
          status: Database["public"]["Enums"]["loan_status"] | null
          total_interest_paid: number | null
          total_penalty_paid: number | null
          total_principal_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balance: {
        Row: {
          account_code: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          period_month: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      build_hr_cost_submission_payload: {
        Args: { p_period: string }
        Returns: {
          dept_summaries: Json
          pool_allocation_snapshot: Json
          staff_allocation_snapshot: Json
          staff_snapshot: Json
        }[]
      }
      calculate_base_rate: {
        Args: never
        Returns: {
          op_margin: number
          proposed_base_rate: number
          total_paid_capital: number
          weighted_cost: number
        }[]
      }
      calculate_days_overdue: {
        Args: { p_as_of_date?: string; p_loan_id: string }
        Returns: number
      }
      calculate_dept_np: {
        Args: { p_dept_id: string; p_period: string }
        Returns: {
          out_department_id: string
          out_expenses: number
          out_net_profit: number
          out_period_month: string
          out_revenue: number
          out_staff_cost: number
        }[]
      }
      cancel_loan_and_approval: {
        Args: { p_cancel_reason?: string; p_loan_id: string }
        Returns: undefined
      }
      create_loan_with_approval: {
        Args: {
          p_base_rate: number
          p_company_id: string
          p_company_name?: string
          p_company_tier?: string
          p_effective_rate: number
          p_principal: number
          p_repayment_terms?: string
          p_risk_premium: number
        }
        Returns: string
      }
      current_user_department_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_summary: { Args: never; Returns: Json }
      format_invoice_no: { Args: { p_period: string }; Returns: string }
      generate_fixed_split_invoices: {
        Args: {
          p_period_month: string
          p_rent_total?: number
          p_utility_total?: number
        }
        Returns: Json
      }
      generate_monthly_invoices: {
        Args: { p_period_month: string }
        Returns: Json
      }
      get_current_base_rate: {
        Args: { p_as_of_date?: string }
        Returns: {
          base_rate: number
          effective_from: string
          effective_to: string
          id: string
          op_margin: number
          quarter: string
          weighted_cost: number
        }[]
      }
      get_director_payout_summary: {
        Args: { p_period: string }
        Returns: {
          out_payout_count: number
          out_period_month: string
          out_pool_total: number
          out_status: string
          out_total_advance: number
          out_total_eis_ee: number
          out_total_eis_er: number
          out_total_epf_ee: number
          out_total_epf_er: number
          out_total_invoice: number
          out_total_payroll_gross: number
          out_total_payroll_net: number
          out_total_pcb: number
          out_total_saving: number
          out_total_socso_ee: number
          out_total_socso_er: number
          out_total_statutory_surplus: number
        }[]
      }
      get_hr_cost_summary: {
        Args: never
        Returns: {
          department_id: string
          department_name: string
          staff_count: number
          total_allowance: number
          total_basic: number
          total_ctc: number
          total_statutory: number
        }[]
      }
      get_submitted_hr_summary: {
        Args: { p_period: string }
        Returns: {
          dept_summaries: Json
          id: string
          period_month: string
          submitted_at: string
          submitted_by: string
          submitted_by_name: string
        }[]
      }
      is_period_locked: { Args: { p_date: string }; Returns: boolean }
      log_data_access: {
        Args: {
          p_action?: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: undefined
      }
      lookup_eis: {
        Args: { p_period?: string; p_wages: number }
        Returns: {
          employee: number
          employer: number
        }[]
      }
      lookup_epf: {
        Args: {
          p_part?: Database["public"]["Enums"]["epf_part"]
          p_period?: string
          p_wages: number
        }
        Returns: {
          employee: number
          employer: number
        }[]
      }
      lookup_overdue_stage: {
        Args: { p_days_overdue: number }
        Returns: {
          penalty_rate: number
          stage: Database["public"]["Enums"]["overdue_stage"]
        }[]
      }
      lookup_pcb: {
        Args: {
          p_category?: Database["public"]["Enums"]["pcb_category"]
          p_children?: number
          p_income: number
          p_period?: string
        }
        Returns: number
      }
      lookup_socso: {
        Args: {
          p_category?: Database["public"]["Enums"]["socso_category"]
          p_period?: string
          p_wages: number
        }
        Returns: {
          employee: number
          employer: number
        }[]
      }
      mark_matured_fund_sources: { Args: never; Returns: number }
      save_director_salary_results: { Args: { p_data: Json }; Returns: Json }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      approval_request_type:
        | "new_loan"
        | "base_rate"
        | "tier_change"
        | "new_contract"
        | "contract_change"
        | "dept_expense"
        | "advance"
        | "escalation"
        | "invoice_pool_release"
        | "profit_withdrawal"
        | "payment_voucher"
      approval_status: "pending" | "approved" | "rejected"
      approval_workflow_state:
        | "submitted"
        | "under_review"
        | "needs_info"
        | "delegated"
        | "approved"
        | "rejected"
        | "expired"
      billing_mode:
        | "hr_pool_split"
        | "finance_attribution"
        | "finance_mgmt_fee"
        | "marketing_project"
        | "fixed_split"
        | "non_billable"
      claim_status: "pending" | "approved" | "rejected" | "paid"
      claim_type: "project" | "benefit"
      company_tier: "T1" | "T2" | "T3" | "T4"
      contract_status: "active" | "completed" | "cancelled"
      dept_pool_txn_type: "np_in" | "expense_out"
      director_status: "active" | "inactive"
      epf_part: "A" | "C" | "E" | "F"
      fund_source_status: "active" | "matured" | "repaid" | "cancelled"
      fund_source_type:
        | "subsidiary_savings"
        | "director_loan"
        | "department_pool"
        | "director_saving"
      hr_staff_status: "active" | "inactive"
      hv_fund_txn_type:
        | "saving_in"
        | "surplus_in"
        | "deficit_out"
        | "expense_out"
        | "profit_in"
        | "claim_out"
      invoice_pool_txn_type: "accumulate" | "release"
      invoice_status: "draft" | "issued" | "paid" | "paid_via_netting"
      loan_status: "pending_approval" | "active" | "fully_repaid" | "cancelled"
      overdue_stage: "grace" | "late_1" | "late_2" | "escalation"
      overdue_status: "pending" | "paid" | "escalated"
      payment_voucher_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "paid"
        | "voided"
      payment_voucher_type:
        | "loan_repayment"
        | "billing_payment"
        | "claim_payout"
        | "expense"
        | "internal_transfer"
        | "salary_payout"
        | "other"
        | "receive_payment"
      payout_status: "draft" | "confirmed" | "paid"
      pcb_category: "KA1" | "KA2" | "KA3"
      repayment_type: "principal" | "interest" | "penalty" | "netting"
      socso_category: "first" | "second"
      statement_direction: "receivable" | "payable"
      statement_line_type: "invoice" | "contra"
      statement_status: "draft" | "issued" | "paid" | "partial" | "overdue"
      user_role: "principal" | "finance" | "hr" | "dept_manager"
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
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      approval_request_type: [
        "new_loan",
        "base_rate",
        "tier_change",
        "new_contract",
        "contract_change",
        "dept_expense",
        "advance",
        "escalation",
        "invoice_pool_release",
        "profit_withdrawal",
        "payment_voucher",
      ],
      approval_status: ["pending", "approved", "rejected"],
      approval_workflow_state: [
        "submitted",
        "under_review",
        "needs_info",
        "delegated",
        "approved",
        "rejected",
        "expired",
      ],
      billing_mode: [
        "hr_pool_split",
        "finance_attribution",
        "finance_mgmt_fee",
        "marketing_project",
        "fixed_split",
        "non_billable",
      ],
      claim_status: ["pending", "approved", "rejected", "paid"],
      claim_type: ["project", "benefit"],
      company_tier: ["T1", "T2", "T3", "T4"],
      contract_status: ["active", "completed", "cancelled"],
      dept_pool_txn_type: ["np_in", "expense_out"],
      director_status: ["active", "inactive"],
      epf_part: ["A", "C", "E", "F"],
      fund_source_status: ["active", "matured", "repaid", "cancelled"],
      fund_source_type: [
        "subsidiary_savings",
        "director_loan",
        "department_pool",
        "director_saving",
      ],
      hr_staff_status: ["active", "inactive"],
      hv_fund_txn_type: [
        "saving_in",
        "surplus_in",
        "deficit_out",
        "expense_out",
        "profit_in",
        "claim_out",
      ],
      invoice_pool_txn_type: ["accumulate", "release"],
      invoice_status: ["draft", "issued", "paid", "paid_via_netting"],
      loan_status: ["pending_approval", "active", "fully_repaid", "cancelled"],
      overdue_stage: ["grace", "late_1", "late_2", "escalation"],
      overdue_status: ["pending", "paid", "escalated"],
      payment_voucher_status: [
        "draft",
        "pending_approval",
        "approved",
        "paid",
        "voided",
      ],
      payment_voucher_type: [
        "loan_repayment",
        "billing_payment",
        "claim_payout",
        "expense",
        "internal_transfer",
        "salary_payout",
        "other",
        "receive_payment",
      ],
      payout_status: ["draft", "confirmed", "paid"],
      pcb_category: ["KA1", "KA2", "KA3"],
      repayment_type: ["principal", "interest", "penalty", "netting"],
      socso_category: ["first", "second"],
      statement_direction: ["receivable", "payable"],
      statement_line_type: ["invoice", "contra"],
      statement_status: ["draft", "issued", "paid", "partial", "overdue"],
      user_role: ["principal", "finance", "hr", "dept_manager"],
    },
  },
} as const
