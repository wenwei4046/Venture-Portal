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
      payroll_voucher_lines: {
        Row: {
          id: string
          voucher_id: string
          scope: string
          payroll_row_id: string
          period_month: string
          employee_name: string
          employee_code: string | null
          department_id: string | null
          department_name: string | null
          net: number
          salary_component: string
          recipient_account: string | null
          bank_name: string | null
          bank_account_no: string | null
          created_at: string
        }
        Insert: {
          id?: string
          voucher_id: string
          scope: string
          payroll_row_id: string
          period_month: string
          employee_name: string
          employee_code?: string | null
          department_id?: string | null
          department_name?: string | null
          net: number
          salary_component?: string
          recipient_account?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          voucher_id?: string
          scope?: string
          payroll_row_id?: string
          period_month?: string
          employee_name?: string
          employee_code?: string | null
          department_id?: string | null
          department_name?: string | null
          net?: number
          salary_component?: string
          recipient_account?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "payroll_voucher_lines_voucher_id_fkey"; columns: ["voucher_id"]; isOneToOne: false; referencedRelation: "payment_vouchers"; referencedColumns: ["id"] },
          { foreignKeyName: "payroll_voucher_lines_department_id_fkey"; columns: ["department_id"]; isOneToOne: false; referencedRelation: "departments"; referencedColumns: ["id"] },
        ]
      }
      payroll_statutory_voucher_lines: {
        Row: {
          id: string
          voucher_id: string
          scope: string
          payroll_row_id: string
          period_month: string
          scheme: string
          employee_name: string
          employee_code: string | null
          department_id: string | null
          department_name: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          voucher_id: string
          scope: string
          payroll_row_id: string
          period_month: string
          scheme: string
          employee_name: string
          employee_code?: string | null
          department_id?: string | null
          department_name: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          voucher_id?: string
          scope?: string
          payroll_row_id?: string
          period_month?: string
          scheme?: string
          employee_name?: string
          employee_code?: string | null
          department_id?: string | null
          department_name?: string
          amount?: number
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "payroll_statutory_voucher_lines_voucher_id_fkey"; columns: ["voucher_id"]; isOneToOne: false; referencedRelation: "payment_vouchers"; referencedColumns: ["id"] },
          { foreignKeyName: "payroll_statutory_voucher_lines_department_id_fkey"; columns: ["department_id"]; isOneToOne: false; referencedRelation: "departments"; referencedColumns: ["id"] },
        ]
      }
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
      alloc_categories: {
        Row: {
          coa_code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          coa_code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          coa_code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      alloc_company_settings: {
        Row: {
          company_id: string
          enabled: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          enabled?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_staff: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_staff_history: {
        Row: {
          company_id: string | null
          department: string
          department_id: string | null
          id: string
          pct: number
          period_month: string
          snapshotted_at: string
          staff_id: string
          staff_name: string
          status: string
        }
        Insert: {
          company_id?: string | null
          department?: string
          department_id?: string | null
          id?: string
          pct?: number
          period_month: string
          snapshotted_at?: string
          staff_id: string
          staff_name: string
          status: string
        }
        Update: {
          company_id?: string | null
          department?: string
          department_id?: string | null
          id?: string
          pct?: number
          period_month?: string
          snapshotted_at?: string
          staff_id?: string
          staff_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_staff_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_staff_history_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_staff_splits: {
        Row: {
          company_id: string | null
          department_id: string | null
          id: string
          pct: number
          staff_id: string
        }
        Insert: {
          company_id?: string | null
          department_id?: string | null
          id?: string
          pct: number
          staff_id: string
        }
        Update: {
          company_id?: string | null
          department_id?: string | null
          id?: string
          pct?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_staff_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_staff_splits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_staff_splits_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "alloc_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_template_splits: {
        Row: {
          company_id: string
          pct: number
          template_id: string
        }
        Insert: {
          company_id: string
          pct: number
          template_id: string
        }
        Update: {
          company_id?: string
          pct?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_template_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_template_splits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "alloc_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_templates: {
        Row: {
          category_id: string | null
          created_at: string
          default_amount: number
          default_method: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_amount?: number
          default_method?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_amount?: number
          default_method?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "alloc_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_txn_details: {
        Row: {
          amount: number
          company_id: string | null
          department_id: string | null
          id: string
          is_own_share: boolean
          method_detail: string
          txn_id: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          department_id?: string | null
          id?: string
          is_own_share?: boolean
          method_detail?: string
          txn_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          department_id?: string | null
          id?: string
          is_own_share?: boolean
          method_detail?: string
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_txn_details_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_txn_details_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_txn_details_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "alloc_txns"
            referencedColumns: ["id"]
          },
        ]
      }
      alloc_txns: {
        Row: {
          amount: number
          billed_ref: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          hc_period: string | null
          id: string
          method: string
          period_month: string
          txn_no: string
        }
        Insert: {
          amount: number
          billed_ref?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          hc_period?: string | null
          id?: string
          method: string
          period_month: string
          txn_no: string
        }
        Update: {
          amount?: number
          billed_ref?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          hc_period?: string | null
          id?: string
          method?: string
          period_month?: string
          txn_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_txns_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "alloc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alloc_txns_created_by_fkey"
            columns: ["created_by"]
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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
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
      ba_attachments: {
        Row: {
          ba_id: string
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          ba_id: string
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          ba_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ba_attachments_ba_id_fkey"
            columns: ["ba_id"]
            isOneToOne: false
            referencedRelation: "ba_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ba_facilities: {
        Row: {
          ba_no: string | null
          bank_annual_rate: number
          bank_name: string | null
          borrower_company_id: string | null
          borrower_name: string | null
          charge_rate_monthly: number
          created_at: string
          created_by: string | null
          face_amount: number
          fund_source_id: string | null
          hc_rate_monthly: number
          id: string
          loan_id: string | null
          maturity_date: string | null
          notes: string | null
          start_date: string
          status: string
          tenor_days: number
          updated_at: string
        }
        Insert: {
          ba_no?: string | null
          bank_annual_rate?: number
          bank_name?: string | null
          borrower_company_id?: string | null
          borrower_name?: string | null
          charge_rate_monthly?: number
          created_at?: string
          created_by?: string | null
          face_amount: number
          fund_source_id?: string | null
          hc_rate_monthly?: number
          id?: string
          loan_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          start_date: string
          status?: string
          tenor_days: number
          updated_at?: string
        }
        Update: {
          ba_no?: string | null
          bank_annual_rate?: number
          bank_name?: string | null
          borrower_company_id?: string | null
          borrower_name?: string | null
          charge_rate_monthly?: number
          created_at?: string
          created_by?: string | null
          face_amount?: number
          fund_source_id?: string | null
          hc_rate_monthly?: number
          id?: string
          loan_id?: string | null
          maturity_date?: string | null
          notes?: string | null
          start_date?: string
          status?: string
          tenor_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ba_facilities_borrower_company_id_fkey"
            columns: ["borrower_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_facilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_facilities_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_source_outstanding"
            referencedColumns: ["fund_source_id"]
          },
          {
            foreignKeyName: "ba_facilities_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_facilities_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "ba_facilities_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      ba_limits: {
        Row: {
          company_id: string
          created_at: string
          id: string
          limit_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          limit_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          limit_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ba_limits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_limits_updated_by_fkey"
            columns: ["updated_by"]
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
      bank_recon_lines: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          match_kind: string | null
          matched_journal_line_id: string | null
          session_id: string
          txn_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          match_kind?: string | null
          matched_journal_line_id?: string | null
          session_id: string
          txn_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          match_kind?: string | null
          matched_journal_line_id?: string | null
          session_id?: string
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_recon_lines_matched_journal_line_id_fkey"
            columns: ["matched_journal_line_id"]
            isOneToOne: false
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_recon_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bank_recon_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_recon_matches: {
        Row: {
          created_at: string
          id: string
          journal_line_id: string | null
          match_group: string
          session_id: string | null
          statement_line_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          journal_line_id?: string | null
          match_group: string
          session_id?: string | null
          statement_line_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          journal_line_id?: string | null
          match_group?: string
          session_id?: string | null
          statement_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_recon_matches_journal_line_id_fkey"
            columns: ["journal_line_id"]
            isOneToOne: true
            referencedRelation: "journal_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_recon_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bank_recon_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_recon_matches_statement_line_id_fkey"
            columns: ["statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_recon_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_recon_sessions: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          id: string
          period_month: string
          source_filename: string | null
          statement_closing: number | null
          statement_opening: number | null
          status: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: string
          source_filename?: string | null
          statement_closing?: number | null
          statement_opening?: number | null
          status?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: string
          source_filename?: string | null
          statement_closing?: number | null
          statement_opening?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_recon_sessions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_recon_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
          cash_flow_category: Database["public"]["Enums"]["cash_flow_category"]
          code: string
          created_at: string
          is_active: boolean
          is_internal_fund: boolean
          name: string
          parent_code: string | null
          sort_order: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          cash_flow_category: Database["public"]["Enums"]["cash_flow_category"]
          code: string
          created_at?: string
          is_active?: boolean
          is_internal_fund?: boolean
          name: string
          parent_code?: string | null
          sort_order?: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          cash_flow_category?: Database["public"]["Enums"]["cash_flow_category"]
          code?: string
          created_at?: string
          is_active?: boolean
          is_internal_fund?: boolean
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
          {
            foreignKeyName: "coa_parent_code_fk"
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
          payout_route: string | null
          receipt_url: string | null
          source_pool: string | null
          status: Database["public"]["Enums"]["claim_status"]
          voucher_id: string | null
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
          payout_route?: string | null
          receipt_url?: string | null
          source_pool?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          voucher_id?: string | null
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
          payout_route?: string | null
          receipt_url?: string | null
          source_pool?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          voucher_id?: string | null
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
          {
            foreignKeyName: "claims_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_agent_aliases: {
        Row: {
          agent_key: string
          agent_name_sample: string
          created_at: string
          created_by: string | null
          id: string
          staff_id: string
        }
        Insert: {
          agent_key: string
          agent_name_sample: string
          created_at?: string
          created_by?: string | null
          id?: string
          staff_id: string
        }
        Update: {
          agent_key?: string
          agent_name_sample?: string
          created_at?: string
          created_by?: string | null
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_agent_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_agent_aliases_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_brands: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          item_code_prefixes: string[]
          name: string
          note: string | null
          scheme_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_code_prefixes?: string[]
          name: string
          note?: string | null
          scheme_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_code_prefixes?: string[]
          name?: string
          note?: string | null
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_brands_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_hierarchy: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          rank_id: string
          rate_mode: Database["public"]["Enums"]["comm_rate_mode"] | null
          scheme_id: string
          staff_id: string
          upline_staff_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          rank_id: string
          rate_mode?: Database["public"]["Enums"]["comm_rate_mode"] | null
          scheme_id: string
          staff_id: string
          upline_staff_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          rank_id?: string
          rate_mode?: Database["public"]["Enums"]["comm_rate_mode"] | null
          scheme_id?: string
          staff_id?: string
          upline_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_hierarchy_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_hierarchy_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "comm_ranks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_hierarchy_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_hierarchy_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_hierarchy_upline_staff_id_fkey"
            columns: ["upline_staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_item_groups: {
        Row: {
          commissionable: boolean
          created_at: string
          id: string
          item_group: string
          note: string | null
          scheme_id: string
        }
        Insert: {
          commissionable: boolean
          created_at?: string
          id?: string
          item_group: string
          note?: string | null
          scheme_id: string
        }
        Update: {
          commissionable?: boolean
          created_at?: string
          id?: string
          item_group?: string
          note?: string | null
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_item_groups_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_kpi_items: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          kpi_amount: number
          product_code: string
          product_name: string | null
          scheme_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          kpi_amount: number
          product_code: string
          product_name?: string | null
          scheme_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kpi_amount?: number
          product_code?: string
          product_name?: string | null
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_kpi_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_kpi_items_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_kpi_thresholds: {
        Row: {
          bonus_pct: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          min_qty: number
          scheme_id: string
          tier_label: string | null
        }
        Insert: {
          bonus_pct: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          min_qty: number
          scheme_id: string
          tier_label?: string | null
        }
        Update: {
          bonus_pct?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          min_qty?: number
          scheme_id?: string
          tier_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_kpi_thresholds_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_margin_bands: {
        Row: {
          band_key: string
          brand_id: string
          commission_multiplier: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["comm_margin_band_kind"]
          label: string
          margin_pct: number
          monthly_incentive: number
          scheme_id: string
          sort_order: number
        }
        Insert: {
          band_key: string
          brand_id: string
          commission_multiplier?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["comm_margin_band_kind"]
          label: string
          margin_pct: number
          monthly_incentive?: number
          scheme_id: string
          sort_order?: number
        }
        Update: {
          band_key?: string
          brand_id?: string
          commission_multiplier?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["comm_margin_band_kind"]
          label?: string
          margin_pct?: number
          monthly_incentive?: number
          scheme_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "comm_margin_bands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "comm_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_margin_bands_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_open_bill_rules: {
        Row: {
          bill_rank: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          pct: number
          scheme_id: string
        }
        Insert: {
          bill_rank: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          pct: number
          scheme_id: string
        }
        Update: {
          bill_rank?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          pct?: number
          scheme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_open_bill_rules_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_order_releases: {
        Row: {
          id: string
          order_no: string
          order_period_month: string
          period_month: string
          product_revenue: number
          released_at: string
          run_id: string
          staff_id: string
        }
        Insert: {
          id?: string
          order_no: string
          order_period_month: string
          period_month: string
          product_revenue?: number
          released_at?: string
          run_id: string
          staff_id: string
        }
        Update: {
          id?: string
          order_no?: string
          order_period_month?: string
          period_month?: string
          product_revenue?: number
          released_at?: string
          run_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_order_releases_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "comm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_order_releases_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_products: {
        Row: {
          brand_code: string | null
          created_at: string
          id: string
          is_active: boolean
          item_code: string
          item_group: string | null
          note: string | null
          product_name: string | null
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_code: string
          item_group?: string | null
          note?: string | null
          product_name?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_code?: string
          item_group?: string | null
          note?: string | null
          product_name?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_promotion_rules: {
        Row: {
          alternative_group: number
          consecutive_months: number | null
          created_at: string
          criterion: Database["public"]["Enums"]["comm_promotion_criterion"]
          from_rank_key: string
          id: string
          is_enforced: boolean
          margin_band_key: string | null
          note: string | null
          scheme_id: string
          threshold_amount: number | null
          threshold_qty: number | null
          to_rank_key: string
        }
        Insert: {
          alternative_group?: number
          consecutive_months?: number | null
          created_at?: string
          criterion: Database["public"]["Enums"]["comm_promotion_criterion"]
          from_rank_key: string
          id?: string
          is_enforced?: boolean
          margin_band_key?: string | null
          note?: string | null
          scheme_id: string
          threshold_amount?: number | null
          threshold_qty?: number | null
          to_rank_key: string
        }
        Update: {
          alternative_group?: number
          consecutive_months?: number | null
          created_at?: string
          criterion?: Database["public"]["Enums"]["comm_promotion_criterion"]
          from_rank_key?: string
          id?: string
          is_enforced?: boolean
          margin_band_key?: string | null
          note?: string | null
          scheme_id?: string
          threshold_amount?: number | null
          threshold_qty?: number | null
          to_rank_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_promotion_rules_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_ranks: {
        Row: {
          can_recruit: boolean
          consecutive_months: number | null
          created_at: string
          group_sales_threshold: number | null
          id: string
          label: string
          personal_sales_threshold: number | null
          product_rate: number
          rank_key: string
          scheme_id: string
          sort_order: number
          title_id: string
        }
        Insert: {
          can_recruit?: boolean
          consecutive_months?: number | null
          created_at?: string
          group_sales_threshold?: number | null
          id?: string
          label: string
          personal_sales_threshold?: number | null
          product_rate: number
          rank_key: string
          scheme_id: string
          sort_order?: number
          title_id: string
        }
        Update: {
          can_recruit?: boolean
          consecutive_months?: number | null
          created_at?: string
          group_sales_threshold?: number | null
          id?: string
          label?: string
          personal_sales_threshold?: number | null
          product_rate?: number
          rank_key?: string
          scheme_id?: string
          sort_order?: number
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_ranks_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_ranks_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_runs: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          batch_id: string | null
          computed_at: string | null
          computed_by: string | null
          created_at: string
          deferred_orders: Json
          id: string
          penalised_orders: Json
          period_month: string
          released_orders: Json
          reopened_at: string | null
          reopened_by: string | null
          scheme_id: string
          staff_count: number
          status: Database["public"]["Enums"]["comm_run_status"]
          sub_department_id: string
          total_commission: number
          warnings: Json
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          batch_id?: string | null
          computed_at?: string | null
          computed_by?: string | null
          created_at?: string
          deferred_orders?: Json
          id?: string
          penalised_orders?: Json
          period_month: string
          released_orders?: Json
          reopened_at?: string | null
          reopened_by?: string | null
          scheme_id: string
          staff_count?: number
          status?: Database["public"]["Enums"]["comm_run_status"]
          sub_department_id: string
          total_commission?: number
          warnings?: Json
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          batch_id?: string | null
          computed_at?: string | null
          computed_by?: string | null
          created_at?: string
          deferred_orders?: Json
          id?: string
          penalised_orders?: Json
          period_month?: string
          released_orders?: Json
          reopened_at?: string | null
          reopened_by?: string | null
          scheme_id?: string
          staff_count?: number
          status?: Database["public"]["Enums"]["comm_run_status"]
          sub_department_id?: string
          total_commission?: number
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "comm_runs_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "sales_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_runs_computed_by_fkey"
            columns: ["computed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_runs_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_runs_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_runs_sub_department_id_fkey"
            columns: ["sub_department_id"]
            isOneToOne: false
            referencedRelation: "comm_sub_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_schemes: {
        Row: {
          cloned_from_scheme_id: string | null
          created_at: string
          created_by: string | null
          default_rate_mode: Database["public"]["Enums"]["comm_rate_mode"]
          deposit_threshold_pct: number | null
          effective_from: string
          effective_to: string | null
          enable_kpi: boolean
          enable_margin_incentive: boolean
          enable_margin_penalty: boolean
          enable_open_bill: boolean
          enable_override: boolean
          enable_product_revenue: boolean
          id: string
          is_active: boolean
          open_bill_basis: Database["public"]["Enums"]["comm_open_bill_basis"]
          override_includes_kpi: boolean
          scheme_name: string
          sub_department_id: string
          updated_at: string
        }
        Insert: {
          cloned_from_scheme_id?: string | null
          created_at?: string
          created_by?: string | null
          default_rate_mode?: Database["public"]["Enums"]["comm_rate_mode"]
          deposit_threshold_pct?: number | null
          effective_from: string
          effective_to?: string | null
          enable_kpi?: boolean
          enable_margin_incentive?: boolean
          enable_margin_penalty?: boolean
          enable_open_bill?: boolean
          enable_override?: boolean
          enable_product_revenue?: boolean
          id?: string
          is_active?: boolean
          open_bill_basis?: Database["public"]["Enums"]["comm_open_bill_basis"]
          override_includes_kpi?: boolean
          scheme_name: string
          sub_department_id: string
          updated_at?: string
        }
        Update: {
          cloned_from_scheme_id?: string | null
          created_at?: string
          created_by?: string | null
          default_rate_mode?: Database["public"]["Enums"]["comm_rate_mode"]
          deposit_threshold_pct?: number | null
          effective_from?: string
          effective_to?: string | null
          enable_kpi?: boolean
          enable_margin_incentive?: boolean
          enable_margin_penalty?: boolean
          enable_open_bill?: boolean
          enable_override?: boolean
          enable_product_revenue?: boolean
          id?: string
          is_active?: boolean
          open_bill_basis?: Database["public"]["Enums"]["comm_open_bill_basis"]
          override_includes_kpi?: boolean
          scheme_name?: string
          sub_department_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_schemes_cloned_from_scheme_id_fkey"
            columns: ["cloned_from_scheme_id"]
            isOneToOne: false
            referencedRelation: "comm_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_schemes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_schemes_sub_department_id_fkey"
            columns: ["sub_department_id"]
            isOneToOne: false
            referencedRelation: "comm_sub_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_statement_brand_margins: {
        Row: {
          brand_code: string
          cost: number
          id: string
          margin_pct: number | null
          revenue: number
          statement_id: string
          top_band_key: string | null
        }
        Insert: {
          brand_code: string
          cost?: number
          id?: string
          margin_pct?: number | null
          revenue?: number
          statement_id: string
          top_band_key?: string | null
        }
        Update: {
          brand_code?: string
          cost?: number
          id?: string
          margin_pct?: number | null
          revenue?: number
          statement_id?: string
          top_band_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_statement_brand_margins_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "comm_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_statement_lines: {
        Row: {
          amount: number
          basis_amount: number
          component: Database["public"]["Enums"]["comm_component"]
          created_at: string
          id: string
          note: string | null
          qty: number | null
          rate: number | null
          source_line_id: string | null
          source_order_id: string | null
          source_staff_id: string | null
          statement_id: string
        }
        Insert: {
          amount: number
          basis_amount?: number
          component: Database["public"]["Enums"]["comm_component"]
          created_at?: string
          id?: string
          note?: string | null
          qty?: number | null
          rate?: number | null
          source_line_id?: string | null
          source_order_id?: string | null
          source_staff_id?: string | null
          statement_id: string
        }
        Update: {
          amount?: number
          basis_amount?: number
          component?: Database["public"]["Enums"]["comm_component"]
          created_at?: string
          id?: string
          note?: string | null
          qty?: number | null
          rate?: number | null
          source_line_id?: string | null
          source_order_id?: string | null
          source_staff_id?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_statement_lines_source_line_id_fkey"
            columns: ["source_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statement_lines_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statement_lines_source_staff_id_fkey"
            columns: ["source_staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "comm_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_statements: {
        Row: {
          base_rank_key: string | null
          created_at: string
          deferred_revenue: number
          excluded_revenue: number
          group_revenue: number
          id: string
          kpi_base: number
          kpi_commission: number
          kpi_qty: number
          kpi_threshold_pct: number
          margin_band_key: string | null
          margin_cost: number
          margin_incentive: number
          margin_pct: number | null
          margin_penalty_withheld: number
          margin_revenue: number
          open_bill_bonus: number
          override_commission: number
          penalty_weighted_revenue: number
          product_commission: number
          product_rate: number
          product_revenue: number
          promotes_to_title_id: string | null
          qualifies_for_rank_key: string | null
          rank_key: string | null
          rank_title_id: string | null
          rate_mode: Database["public"]["Enums"]["comm_rate_mode"] | null
          run_id: string
          staff_id: string
          total_commission: number
          upline_staff_id: string | null
        }
        Insert: {
          base_rank_key?: string | null
          created_at?: string
          deferred_revenue?: number
          excluded_revenue?: number
          group_revenue?: number
          id?: string
          kpi_base?: number
          kpi_commission?: number
          kpi_qty?: number
          kpi_threshold_pct?: number
          margin_band_key?: string | null
          margin_cost?: number
          margin_incentive?: number
          margin_pct?: number | null
          margin_penalty_withheld?: number
          margin_revenue?: number
          open_bill_bonus?: number
          override_commission?: number
          penalty_weighted_revenue?: number
          product_commission?: number
          product_rate?: number
          product_revenue?: number
          promotes_to_title_id?: string | null
          qualifies_for_rank_key?: string | null
          rank_key?: string | null
          rank_title_id?: string | null
          rate_mode?: Database["public"]["Enums"]["comm_rate_mode"] | null
          run_id: string
          staff_id: string
          total_commission?: number
          upline_staff_id?: string | null
        }
        Update: {
          base_rank_key?: string | null
          created_at?: string
          deferred_revenue?: number
          excluded_revenue?: number
          group_revenue?: number
          id?: string
          kpi_base?: number
          kpi_commission?: number
          kpi_qty?: number
          kpi_threshold_pct?: number
          margin_band_key?: string | null
          margin_cost?: number
          margin_incentive?: number
          margin_pct?: number | null
          margin_penalty_withheld?: number
          margin_revenue?: number
          open_bill_bonus?: number
          override_commission?: number
          penalty_weighted_revenue?: number
          product_commission?: number
          product_rate?: number
          product_revenue?: number
          promotes_to_title_id?: string | null
          qualifies_for_rank_key?: string | null
          rank_key?: string | null
          rank_title_id?: string | null
          rate_mode?: Database["public"]["Enums"]["comm_rate_mode"] | null
          run_id?: string
          staff_id?: string
          total_commission?: number
          upline_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_statements_promotes_to_title_id_fkey"
            columns: ["promotes_to_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statements_rank_title_id_fkey"
            columns: ["rank_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statements_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "comm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_statements_upline_staff_id_fkey"
            columns: ["upline_staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_sub_departments: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_sub_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_sub_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_title_promotions: {
        Row: {
          from_title_id: string | null
          id: string
          period_month: string
          promoted_at: string
          promoted_by: string | null
          run_id: string | null
          staff_id: string
          to_title_id: string
        }
        Insert: {
          from_title_id?: string | null
          id?: string
          period_month: string
          promoted_at?: string
          promoted_by?: string | null
          run_id?: string | null
          staff_id: string
          to_title_id: string
        }
        Update: {
          from_title_id?: string | null
          id?: string
          period_month?: string
          promoted_at?: string
          promoted_by?: string | null
          run_id?: string | null
          staff_id?: string
          to_title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_title_promotions_from_title_id_fkey"
            columns: ["from_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_title_promotions_promoted_by_fkey"
            columns: ["promoted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_title_promotions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "comm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_title_promotions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_title_promotions_to_title_id_fkey"
            columns: ["to_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_inputs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period_month: string
          sales_amount: number
          sales_count: number
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month: string
          sales_amount?: number
          sales_count?: number
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month?: string
          sales_amount?: number
          sales_count?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_inputs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_inputs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          base_dept_id: string | null
          base_source:
            | Database["public"]["Enums"]["commission_base_source"]
            | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          pct: number | null
          rule_name: string
          rule_type: Database["public"]["Enums"]["commission_rule_type"]
          staff_id: string | null
          tier_config: Json | null
        }
        Insert: {
          base_dept_id?: string | null
          base_source?:
            | Database["public"]["Enums"]["commission_base_source"]
            | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          pct?: number | null
          rule_name: string
          rule_type: Database["public"]["Enums"]["commission_rule_type"]
          staff_id?: string | null
          tier_config?: Json | null
        }
        Update: {
          base_dept_id?: string | null
          base_source?:
            | Database["public"]["Enums"]["commission_base_source"]
            | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          pct?: number | null
          rule_name?: string
          rule_type?: Database["public"]["Enums"]["commission_rule_type"]
          staff_id?: string | null
          tier_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_base_dept_id_fkey"
            columns: ["base_dept_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ar_account_code: string | null
          created_at: string
          director_heads: number
          id: string
          is_active: boolean
          name: string
          short_code: string
          updated_at: string
        }
        Insert: {
          ar_account_code?: string | null
          created_at?: string
          director_heads?: number
          id?: string
          is_active?: boolean
          name: string
          short_code: string
          updated_at?: string
        }
        Update: {
          ar_account_code?: string | null
          created_at?: string
          director_heads?: number
          id?: string
          is_active?: boolean
          name?: string
          short_code?: string
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
          billable_to_department_id: string | null
          billable_to_freetext_name: string | null
          billable_to_type: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode: Database["public"]["Enums"]["billing_mode"] | null
          category_code: string | null
          company_id: string | null
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
          billable_to_department_id?: string | null
          billable_to_freetext_name?: string | null
          billable_to_type: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode?: Database["public"]["Enums"]["billing_mode"] | null
          category_code?: string | null
          company_id?: string | null
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
          billable_to_department_id?: string | null
          billable_to_freetext_name?: string | null
          billable_to_type?: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode?: Database["public"]["Enums"]["billing_mode"] | null
          category_code?: string | null
          company_id?: string | null
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
            foreignKeyName: "credit_notes_billable_to_department_id_fkey"
            columns: ["billable_to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
          billing_mode_key: string | null
          cost_model: string
          created_at: string
          id: string
          is_internal: boolean
          name: string
          own_share_billback: boolean
          payroll_source: string
          pool_gl_code: string | null
          segment_key: string | null
        }
        Insert: {
          billing_mode_key?: string | null
          cost_model?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          name: string
          own_share_billback?: boolean
          payroll_source?: string
          pool_gl_code?: string | null
          segment_key?: string | null
        }
        Update: {
          billing_mode_key?: string | null
          cost_model?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          name?: string
          own_share_billback?: boolean
          payroll_source?: string
          pool_gl_code?: string | null
          segment_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_pool_gl_code_fkey"
            columns: ["pool_gl_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      dept_payment_requests: {
        Row: {
          amount: number
          cancelled_at: string | null
          cancelled_by: string | null
          category_code: string | null
          created_at: string
          department_id: string
          dept_pool_id: string | null
          description: string
          expense_approval_id: string | null
          id: string
          notes: string | null
          pay_from_account_id: string | null
          payee_company_id: string | null
          payee_name: string
          payment_method: string | null
          pv_id: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["dept_payment_request_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_code?: string | null
          created_at?: string
          department_id: string
          dept_pool_id?: string | null
          description: string
          expense_approval_id?: string | null
          id?: string
          notes?: string | null
          pay_from_account_id?: string | null
          payee_company_id?: string | null
          payee_name: string
          payment_method?: string | null
          pv_id?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["dept_payment_request_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_code?: string | null
          created_at?: string
          department_id?: string
          dept_pool_id?: string | null
          description?: string
          expense_approval_id?: string | null
          id?: string
          notes?: string | null
          pay_from_account_id?: string | null
          payee_company_id?: string | null
          payee_name?: string
          payment_method?: string | null
          pv_id?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["dept_payment_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dept_payment_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_dept_pool_id_fkey"
            columns: ["dept_pool_id"]
            isOneToOne: false
            referencedRelation: "dept_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_expense_approval_id_fkey"
            columns: ["expense_approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_expense_approval_id_fkey"
            columns: ["expense_approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests_with_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_pay_from_account_id_fkey"
            columns: ["pay_from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_payee_company_id_fkey"
            columns: ["payee_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_pv_id_fkey"
            columns: ["pv_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_payment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      director_advance_offsets: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          director_id: string
          id: string
          invoice_release_id: string | null
          journal_entry_id: string | null
          note: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          director_id: string
          id?: string
          invoice_release_id?: string | null
          journal_entry_id?: string | null
          note?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          director_id?: string
          id?: string
          invoice_release_id?: string | null
          journal_entry_id?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "director_advance_offsets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_advance_offsets_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_advance_offsets_invoice_release_id_fkey"
            columns: ["invoice_release_id"]
            isOneToOne: false
            referencedRelation: "invoice_payout_pool"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_advance_offsets_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
          er_manual: boolean
          heads: number
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
          er_manual?: boolean
          heads?: number
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
          er_manual?: boolean
          heads?: number
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
      director_monthly_payroll: {
        Row: {
          basic_salary: number
          commission_amount: number
          completed_at: string | null
          completed_by: string | null
          status: string
          topup_kind: string | null
          topup_opened_at: string | null
          topup_opened_by: string | null
          created_at: string
          created_by: string | null
          deduction_amount: number
          dept_name: string
          director_id: string | null
          eis_ee: number
          eis_er: number
          employee_code: string
          employee_name: string
          epf_ee: number
          epf_er: number
          gross: number
          id: string
          net: number
          no_pay_amount: number
          non_statutory_allowance: number
          ot_amount: number
          pcb: number
          period_month: string
          skbbk_amount: number
          socso_ee: number
          socso_er: number
          source: string
          statutory_allowance: number
          updated_at: string
        }
        Insert: {
          basic_salary?: number
          commission_amount?: number
          completed_at?: string | null
          completed_by?: string | null
          status?: string
          topup_kind?: string | null
          topup_opened_at?: string | null
          topup_opened_by?: string | null
          created_at?: string
          created_by?: string | null
          deduction_amount?: number
          dept_name?: string
          director_id?: string | null
          eis_ee?: number
          eis_er?: number
          employee_code?: string
          employee_name: string
          epf_ee?: number
          epf_er?: number
          gross?: number
          id?: string
          net?: number
          no_pay_amount?: number
          non_statutory_allowance?: number
          ot_amount?: number
          pcb?: number
          period_month: string
          skbbk_amount?: number
          socso_ee?: number
          socso_er?: number
          source?: string
          statutory_allowance?: number
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          commission_amount?: number
          completed_at?: string | null
          completed_by?: string | null
          status?: string
          topup_kind?: string | null
          topup_opened_at?: string | null
          topup_opened_by?: string | null
          created_at?: string
          created_by?: string | null
          deduction_amount?: number
          dept_name?: string
          director_id?: string | null
          eis_ee?: number
          eis_er?: number
          employee_code?: string
          employee_name?: string
          epf_ee?: number
          epf_er?: number
          gross?: number
          id?: string
          net?: number
          no_pay_amount?: number
          non_statutory_allowance?: number
          ot_amount?: number
          pcb?: number
          period_month?: string
          skbbk_amount?: number
          socso_ee?: number
          socso_er?: number
          source?: string
          statutory_allowance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_monthly_payroll_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_monthly_payroll_director_id_fkey"
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
          advance_opening_balance: number
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
          payout_mode: string
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
          payroll_skbbk: number
          payroll_socso_ee: number | null
          payroll_socso_er: number | null
          period_month: string
          saving_amount: number | null
          status: Database["public"]["Enums"]["payout_status"]
          statutory_er_in: number | null
          statutory_er_out: number | null
          statutory_overridden_at: string | null
          statutory_overridden_by: string | null
          statutory_surplus: number | null
        }
        Insert: {
          advance_amount?: number
          advance_balance?: number
          advance_opening_balance?: number
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
          payout_mode?: string
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
          payroll_skbbk?: number
          payroll_socso_ee?: number | null
          payroll_socso_er?: number | null
          period_month: string
          saving_amount?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          statutory_er_in?: number | null
          statutory_er_out?: number | null
          statutory_overridden_at?: string | null
          statutory_overridden_by?: string | null
          statutory_surplus?: number | null
        }
        Update: {
          advance_amount?: number
          advance_balance?: number
          advance_opening_balance?: number
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
          payout_mode?: string
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
          payroll_skbbk?: number
          payroll_socso_ee?: number | null
          payroll_socso_er?: number | null
          period_month?: string
          saving_amount?: number | null
          status?: Database["public"]["Enums"]["payout_status"]
          statutory_er_in?: number | null
          statutory_er_out?: number | null
          statutory_overridden_at?: string | null
          statutory_overridden_by?: string | null
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
          {
            foreignKeyName: "director_payouts_statutory_overridden_by_fkey"
            columns: ["statutory_overridden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      director_salary_submissions: {
        Row: {
          by_company: Json
          created_at: string
          director_count: number
          id: string
          period_month: string
          submitted_at: string
          submitted_by: string
          total_gross: number
          total_invoice: number
          total_payroll_gross: number
          total_payroll_net: number
          total_saving: number
          total_statutory_er: number
        }
        Insert: {
          by_company?: Json
          created_at?: string
          director_count?: number
          id?: string
          period_month: string
          submitted_at?: string
          submitted_by: string
          total_gross?: number
          total_invoice?: number
          total_payroll_gross?: number
          total_payroll_net?: number
          total_saving?: number
          total_statutory_er?: number
        }
        Update: {
          by_company?: Json
          created_at?: string
          director_count?: number
          id?: string
          period_month?: string
          submitted_at?: string
          submitted_by?: string
          total_gross?: number
          total_invoice?: number
          total_payroll_gross?: number
          total_payroll_net?: number
          total_saving?: number
          total_statutory_er?: number
        }
        Relationships: [
          {
            foreignKeyName: "director_salary_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          nric: string | null
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
          nric?: string | null
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
          nric?: string | null
          pcb_category?: Database["public"]["Enums"]["pcb_category"]
          status?: Database["public"]["Enums"]["director_status"]
          tax_ref_no?: string | null
          updated_at?: string
          weightage?: number
        }
        Relationships: []
      }
      dp_companies: {
        Row: {
          exclude_from_pay: boolean
          id: string
          is_active: boolean
          name: string
          sort: number
        }
        Insert: {
          exclude_from_pay?: boolean
          id?: string
          is_active?: boolean
          name: string
          sort?: number
        }
        Update: {
          exclude_from_pay?: boolean
          id?: string
          is_active?: boolean
          name?: string
          sort?: number
        }
        Relationships: []
      }
      dp_contra: {
        Row: {
          amount: number
          created_at: string
          director_id: string
          from_month_id: string
          id: string
        }
        Insert: {
          amount: number
          created_at?: string
          director_id: string
          from_month_id: string
          id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          director_id?: string
          from_month_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dp_contra_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "dp_directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_contra_from_month_id_fkey"
            columns: ["from_month_id"]
            isOneToOne: false
            referencedRelation: "dp_months"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_director_inputs: {
        Row: {
          adv_override_accum: number | null
          adv_override_this: number | null
          adv_stat: number | null
          allow_billing_stat: number | null
          allow_pay_stat: number | null
          billing_stat: number | null
          director_id: string
          id: string
          is_contra_override: boolean
          month_id: string
          saving_withdrawal: number | null
        }
        Insert: {
          adv_override_accum?: number | null
          adv_override_this?: number | null
          adv_stat?: number | null
          allow_billing_stat?: number | null
          allow_pay_stat?: number | null
          billing_stat?: number | null
          director_id: string
          id?: string
          is_contra_override?: boolean
          month_id: string
          saving_withdrawal?: number | null
        }
        Update: {
          adv_override_accum?: number | null
          adv_override_this?: number | null
          adv_stat?: number | null
          allow_billing_stat?: number | null
          allow_pay_stat?: number | null
          billing_stat?: number | null
          director_id?: string
          id?: string
          is_contra_override?: boolean
          month_id?: string
          saving_withdrawal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dp_director_inputs_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "dp_directors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_director_inputs_month_id_fkey"
            columns: ["month_id"]
            isOneToOne: false
            referencedRelation: "dp_months"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_directors: {
        Row: {
          code: string
          color: string
          id: string
          name: string
          sort: number
          weight: number
        }
        Insert: {
          code: string
          color?: string
          id?: string
          name: string
          sort?: number
          weight?: number
        }
        Update: {
          code?: string
          color?: string
          id?: string
          name?: string
          sort?: number
          weight?: number
        }
        Relationships: []
      }
      dp_fixed_overrides: {
        Row: {
          director_id: string
          from_month: string
          id: string
          salary: number
        }
        Insert: {
          director_id: string
          from_month: string
          id?: string
          salary: number
        }
        Update: {
          director_id?: string
          from_month?: string
          id?: string
          salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_fixed_overrides_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "dp_directors"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_inputs: {
        Row: {
          allowance: number
          company_id: string
          id: string
          kpi: number
          month_id: string
          salary: number
        }
        Insert: {
          allowance?: number
          company_id: string
          id?: string
          kpi?: number
          month_id: string
          salary?: number
        }
        Update: {
          allowance?: number
          company_id?: string
          id?: string
          kpi?: number
          month_id?: string
          salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "dp_inputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dp_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dp_inputs_month_id_fkey"
            columns: ["month_id"]
            isOneToOne: false
            referencedRelation: "dp_months"
            referencedColumns: ["id"]
          },
        ]
      }
      dp_months: {
        Row: {
          allow_excl_full_payout: boolean
          billing_deduct_adv: boolean
          created_at: string
          full_payout: boolean
          id: string
          include_billing: boolean
          month: string
        }
        Insert: {
          allow_excl_full_payout?: boolean
          billing_deduct_adv?: boolean
          created_at?: string
          full_payout?: boolean
          id?: string
          include_billing?: boolean
          month: string
        }
        Update: {
          allow_excl_full_payout?: boolean
          billing_deduct_adv?: boolean
          created_at?: string
          full_payout?: boolean
          id?: string
          include_billing?: boolean
          month?: string
        }
        Relationships: []
      }
      dp_settings: {
        Row: {
          allow_stat_until: string | null
          billing_start_month: string | null
          fixed_salary: number
          gb_pct: number
          id: number
          saving_pct: number
          updated_at: string
        }
        Insert: {
          allow_stat_until?: string | null
          billing_start_month?: string | null
          fixed_salary?: number
          gb_pct?: number
          id?: number
          saving_pct?: number
          updated_at?: string
        }
        Update: {
          allow_stat_until?: string | null
          billing_start_month?: string | null
          fixed_salary?: number
          gb_pct?: number
          id?: number
          saving_pct?: number
          updated_at?: string
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
          account_code: string | null
          amount: number
          bank_account_id: string | null
          capital_type: string
          compound_interest: boolean
          cost_rate: number
          created_at: string
          created_by: string
          early_withdrawal: boolean
          effective_date: string
          from_company_id: string | null
          from_department_id: string | null
          from_director_id: string | null
          from_freetext_name: string | null
          id: string
          lock_in_months: number | null
          maturity_date: string | null
          min_pay_interest: boolean
          notes: string | null
          penalty_on_early: number | null
          repaid_at: string | null
          repaid_by: string | null
          repayment_date: string | null
          repayment_start_month: string | null
          terms_effective_from: string | null
          source_type: Database["public"]["Enums"]["fund_source_type"]
          status: Database["public"]["Enums"]["fund_source_status"]
          updated_at: string
          version: number
        }
        Insert: {
          account_code?: string | null
          amount: number
          bank_account_id?: string | null
          capital_type?: string
          compound_interest?: boolean
          cost_rate: number
          created_at?: string
          created_by: string
          early_withdrawal?: boolean
          effective_date: string
          from_company_id?: string | null
          from_department_id?: string | null
          from_director_id?: string | null
          from_freetext_name?: string | null
          id?: string
          lock_in_months?: number | null
          maturity_date?: string | null
          min_pay_interest?: boolean
          notes?: string | null
          penalty_on_early?: number | null
          repaid_at?: string | null
          repaid_by?: string | null
          repayment_date?: string | null
          repayment_start_month?: string | null
          terms_effective_from?: string | null
          source_type: Database["public"]["Enums"]["fund_source_type"]
          status?: Database["public"]["Enums"]["fund_source_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          account_code?: string | null
          amount?: number
          bank_account_id?: string | null
          capital_type?: string
          compound_interest?: boolean
          cost_rate?: number
          created_at?: string
          created_by?: string
          early_withdrawal?: boolean
          effective_date?: string
          from_company_id?: string | null
          from_department_id?: string | null
          from_director_id?: string | null
          from_freetext_name?: string | null
          id?: string
          lock_in_months?: number | null
          maturity_date?: string | null
          min_pay_interest?: boolean
          notes?: string | null
          penalty_on_early?: number | null
          repaid_at?: string | null
          repaid_by?: string | null
          repayment_date?: string | null
          repayment_start_month?: string | null
          terms_effective_from?: string | null
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
            foreignKeyName: "fund_sources_account_code_fk"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fund_sources_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
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
            foreignKeyName: "fund_sources_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
          execution_state: string | null
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
          execution_state?: string | null
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
          execution_state?: string | null
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
      hr_import_templates: {
        Row: {
          column_map: Json
          created_at: string
          id: string
          match_strategy: string
          template_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          column_map: Json
          created_at?: string
          id?: string
          match_strategy?: string
          template_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          column_map?: Json
          created_at?: string
          id?: string
          match_strategy?: string
          template_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_import_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_monthly_payroll: {
        Row: {
          basic_salary: number
          commission_amount: number
          commission_synced_amount: number | null
          completed_at: string | null
          completed_by: string | null
          topup_kind: string | null
          topup_opened_at: string | null
          topup_opened_by: string | null
          commission_adjustment_amount: number
          commission_adjustment_reason: string | null
          commission_adjusted_at: string | null
          commission_adjusted_by: string | null
          commission_balance: number | null
          payout_split_version: number | null
          pay_line_deductions: number
          pay_line_earnings: number
          basic_pay_net: number | null
          pcb_override_amount: number | null
          epf_er_override_amount: number | null
          epf_ee_override_amount: number | null
          socso_er_override_amount: number | null
          socso_ee_override_amount: number | null
          eis_er_override_amount: number | null
          eis_ee_override_amount: number | null
          created_at: string
          created_by: string | null
          deduction_amount: number
          eis_ee: number
          eis_er: number
          epf_ee: number
          epf_er: number
          gross: number
          id: string
          net: number
          non_statutory_allowance: number
          ot_amount: number
          ot_hours: number
          pcb: number
          period_month: string
          prorata_days_in_month: number
          prorata_days_worked: number
          skbbk_amount: number
          socso_ee: number
          socso_er: number
          source: Database["public"]["Enums"]["hr_monthly_payroll_source"]
          staff_id: string
          status: Database["public"]["Enums"]["hr_monthly_payroll_status"]
          statutory_allowance: number
          statutory_overridden_at: string | null
          statutory_overridden_by: string | null
          unpaid_leave_days: number
          updated_at: string
          withholding_tax: number
        }
        Insert: {
          basic_salary?: number
          commission_amount?: number
          commission_synced_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          topup_kind?: string | null
          topup_opened_at?: string | null
          topup_opened_by?: string | null
          commission_adjustment_amount?: number
          commission_adjustment_reason?: string | null
          commission_adjusted_at?: string | null
          commission_adjusted_by?: string | null
          commission_balance?: number | null
          payout_split_version?: number | null
          pay_line_deductions?: number
          pay_line_earnings?: number
          basic_pay_net?: number | null
          pcb_override_amount?: number | null
          epf_er_override_amount?: number | null
          epf_ee_override_amount?: number | null
          socso_er_override_amount?: number | null
          socso_ee_override_amount?: number | null
          eis_er_override_amount?: number | null
          eis_ee_override_amount?: number | null
          created_at?: string
          created_by?: string | null
          deduction_amount?: number
          eis_ee?: number
          eis_er?: number
          epf_ee?: number
          epf_er?: number
          gross?: number
          id?: string
          net?: number
          non_statutory_allowance?: number
          ot_amount?: number
          ot_hours?: number
          pcb?: number
          period_month: string
          prorata_days_in_month?: number
          prorata_days_worked?: number
          skbbk_amount?: number
          socso_ee?: number
          socso_er?: number
          source?: Database["public"]["Enums"]["hr_monthly_payroll_source"]
          staff_id: string
          status?: Database["public"]["Enums"]["hr_monthly_payroll_status"]
          statutory_allowance?: number
          statutory_overridden_at?: string | null
          statutory_overridden_by?: string | null
          unpaid_leave_days?: number
          updated_at?: string
          withholding_tax?: number
        }
        Update: {
          basic_salary?: number
          commission_amount?: number
          commission_synced_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          topup_kind?: string | null
          topup_opened_at?: string | null
          topup_opened_by?: string | null
          commission_adjustment_amount?: number
          commission_adjustment_reason?: string | null
          commission_adjusted_at?: string | null
          commission_adjusted_by?: string | null
          commission_balance?: number | null
          payout_split_version?: number | null
          pay_line_deductions?: number
          pay_line_earnings?: number
          basic_pay_net?: number | null
          pcb_override_amount?: number | null
          epf_er_override_amount?: number | null
          epf_ee_override_amount?: number | null
          socso_er_override_amount?: number | null
          socso_ee_override_amount?: number | null
          eis_er_override_amount?: number | null
          eis_ee_override_amount?: number | null
          created_at?: string
          created_by?: string | null
          deduction_amount?: number
          eis_ee?: number
          eis_er?: number
          epf_ee?: number
          epf_er?: number
          gross?: number
          id?: string
          net?: number
          non_statutory_allowance?: number
          ot_amount?: number
          ot_hours?: number
          pcb?: number
          period_month?: string
          prorata_days_in_month?: number
          prorata_days_worked?: number
          skbbk_amount?: number
          socso_ee?: number
          socso_er?: number
          source?: Database["public"]["Enums"]["hr_monthly_payroll_source"]
          staff_id?: string
          status?: Database["public"]["Enums"]["hr_monthly_payroll_status"]
          statutory_allowance?: number
          statutory_overridden_at?: string | null
          statutory_overridden_by?: string | null
          unpaid_leave_days?: number
          updated_at?: string
          withholding_tax?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_monthly_payroll_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_monthly_payroll_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_monthly_payroll_statutory_overridden_by_fkey"
            columns: ["statutory_overridden_by"]
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
          address: string | null
          allowances: number
          bank_account_no: string | null
          bank_name_2: string | null
          bank_account_no_2: string | null
          bank_name: string | null
          basic_salary: number
          children_count: number
          contact_number: string | null
          created_at: string
          created_by: string
          department_id: string
          designation: string | null
          eis_er: number | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employee_code: string | null
          home_sub_department_id: string | null
          infotech_code: string | null
          employee_name: string
          employment_type: Database["public"]["Enums"]["hr_employment_type"]
          epf_category: Database["public"]["Enums"]["epf_part"]
          epf_er: number | null
          hire_date: string | null
          id: string
          is_epf_exempt: boolean
          non_statutory_allowance: number
          nric: string | null
          pcb_category: Database["public"]["Enums"]["pcb_category"]
          reports_to: string | null
          resignation_date: string | null
          socso_category: Database["public"]["Enums"]["socso_category"]
          socso_er: number | null
          status: Database["public"]["Enums"]["hr_staff_status"]
          tax_mode: Database["public"]["Enums"]["hr_tax_mode"]
          title_id: string | null
          total_ctc: number | null
          updated_at: string
          user_id: string | null
          withholding_rate: number
        }
        Insert: {
          address?: string | null
          allowances?: number
          bank_account_no?: string | null
          bank_name_2?: string | null
          bank_account_no_2?: string | null
          bank_name?: string | null
          basic_salary: number
          children_count?: number
          contact_number?: string | null
          created_at?: string
          created_by: string
          department_id: string
          designation?: string | null
          eis_er?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_code?: string | null
          home_sub_department_id?: string | null
          infotech_code?: string | null
          employee_name: string
          employment_type?: Database["public"]["Enums"]["hr_employment_type"]
          epf_category?: Database["public"]["Enums"]["epf_part"]
          epf_er?: number | null
          hire_date?: string | null
          id?: string
          is_epf_exempt?: boolean
          non_statutory_allowance?: number
          nric?: string | null
          pcb_category?: Database["public"]["Enums"]["pcb_category"]
          reports_to?: string | null
          resignation_date?: string | null
          socso_category?: Database["public"]["Enums"]["socso_category"]
          socso_er?: number | null
          status?: Database["public"]["Enums"]["hr_staff_status"]
          tax_mode?: Database["public"]["Enums"]["hr_tax_mode"]
          title_id?: string | null
          total_ctc?: number | null
          updated_at?: string
          user_id?: string | null
          withholding_rate?: number
        }
        Update: {
          address?: string | null
          allowances?: number
          bank_account_no?: string | null
          bank_name_2?: string | null
          bank_account_no_2?: string | null
          bank_name?: string | null
          basic_salary?: number
          children_count?: number
          contact_number?: string | null
          created_at?: string
          created_by?: string
          department_id?: string
          designation?: string | null
          eis_er?: number | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_code?: string | null
          home_sub_department_id?: string | null
          infotech_code?: string | null
          employee_name?: string
          employment_type?: Database["public"]["Enums"]["hr_employment_type"]
          epf_category?: Database["public"]["Enums"]["epf_part"]
          epf_er?: number | null
          hire_date?: string | null
          id?: string
          is_epf_exempt?: boolean
          non_statutory_allowance?: number
          nric?: string | null
          pcb_category?: Database["public"]["Enums"]["pcb_category"]
          reports_to?: string | null
          resignation_date?: string | null
          socso_category?: Database["public"]["Enums"]["socso_category"]
          socso_er?: number | null
          status?: Database["public"]["Enums"]["hr_staff_status"]
          tax_mode?: Database["public"]["Enums"]["hr_tax_mode"]
          title_id?: string | null
          total_ctc?: number | null
          updated_at?: string
          user_id?: string | null
          withholding_rate?: number
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
          {
            foreignKeyName: "hr_staff_costs_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_costs_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_costs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_staff_salary_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          effective_from: string
          id: string
          new_basic: number
          old_basic: number
          reason: string | null
          staff_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          effective_from: string
          id?: string
          new_basic: number
          old_basic: number
          reason?: string | null
          staff_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          effective_from?: string
          id?: string
          new_basic?: number
          old_basic?: number
          reason?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_salary_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_staff_salary_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          category_code: string | null
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          line_no: number
          segment: Database["public"]["Enums"]["gl_segment"] | null
        }
        Insert: {
          amount: number
          category_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          line_no: number
          segment?: Database["public"]["Enums"]["gl_segment"] | null
        }
        Update: {
          amount?: number
          category_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          line_no?: number
          segment?: Database["public"]["Enums"]["gl_segment"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          period_month: string | null
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
          period_month?: string | null
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
          period_month?: string | null
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
      invoice_submission_requests: {
        Row: {
          created_at: string
          department_id: string
          description: string
          due_date: string
          generated_at: string | null
          generated_by: string | null
          generated_invoice_ids: string[] | null
          id: string
          invoice_date: string
          line_items: Json
          period_month: string
          reference_no: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["invoice_submission_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          description: string
          due_date: string
          generated_at?: string | null
          generated_by?: string | null
          generated_invoice_ids?: string[] | null
          id?: string
          invoice_date: string
          line_items: Json
          period_month: string
          reference_no?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["invoice_submission_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          description?: string
          due_date?: string
          generated_at?: string | null
          generated_by?: string | null
          generated_invoice_ids?: string[] | null
          id?: string
          invoice_date?: string
          line_items?: Json
          period_month?: string
          reference_no?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["invoice_submission_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_submission_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_submission_requests_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_submission_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_submission_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base_amount: number | null
          billable_to_department_id: string | null
          billable_to_freetext_address: string | null
          billable_to_freetext_email: string | null
          billable_to_freetext_name: string | null
          billable_to_freetext_phone: string | null
          billable_to_type: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          category_code: string | null
          company_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_no: string | null
          period_month: string
          reference_no: string | null
          settlement_voucher_id: string | null
          sst_amount: number | null
          sst_rate: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
          version: number
        }
        Insert: {
          base_amount?: number | null
          billable_to_department_id?: string | null
          billable_to_freetext_address?: string | null
          billable_to_freetext_email?: string | null
          billable_to_freetext_name?: string | null
          billable_to_freetext_phone?: string | null
          billable_to_type: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          category_code?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          period_month: string
          reference_no?: string | null
          settlement_voucher_id?: string | null
          sst_amount?: number | null
          sst_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
          version?: number
        }
        Update: {
          base_amount?: number | null
          billable_to_department_id?: string | null
          billable_to_freetext_address?: string | null
          billable_to_freetext_email?: string | null
          billable_to_freetext_name?: string | null
          billable_to_freetext_phone?: string | null
          billable_to_type?: Database["public"]["Enums"]["billable_to_kind"]
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          category_code?: string | null
          company_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          period_month?: string
          reference_no?: string | null
          settlement_voucher_id?: string | null
          sst_amount?: number | null
          sst_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billable_to_department_id_fkey"
            columns: ["billable_to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "invoices_settlement_voucher_id_fkey"
            columns: ["settlement_voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
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
          segment: Database["public"]["Enums"]["gl_segment"]
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
          segment?: Database["public"]["Enums"]["gl_segment"]
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
          segment?: Database["public"]["Enums"]["gl_segment"]
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
          compound_interest: boolean
          created_at: string
          created_by: string
          disbursement_date: string | null
          effective_rate: number
          id: string
          min_pay_interest: boolean
          principal: number
          repayment_start_month: string | null
          repayment_start_date: string | null
          terms_effective_from: string | null
          repayment_terms: string | null
          risk_premium: number
          status: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate: number
          company_id: string
          compound_interest?: boolean
          created_at?: string
          created_by: string
          disbursement_date?: string | null
          effective_rate: number
          id?: string
          min_pay_interest?: boolean
          principal: number
          repayment_start_month?: string | null
          repayment_start_date?: string | null
          terms_effective_from?: string | null
          repayment_terms?: string | null
          risk_premium: number
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_rate?: number
          company_id?: string
          compound_interest?: boolean
          created_at?: string
          created_by?: string
          disbursement_date?: string | null
          effective_rate?: number
          id?: string
          min_pay_interest?: boolean
          principal?: number
          repayment_start_month?: string | null
          repayment_start_date?: string | null
          terms_effective_from?: string | null
          repayment_terms?: string | null
          risk_premium?: number
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months?: number
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
      monthly_headcounts: {
        Row: {
          company_id: string | null
          headcount: number
          id: string
          period_month: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          company_id?: string | null
          headcount: number
          id?: string
          period_month: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          company_id?: string | null
          headcount?: number
          id?: string
          period_month?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_headcounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_headcounts_updated_by_fkey"
            columns: ["updated_by"]
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
          is_overdue: boolean
          loan_id: string
          overdue_days: number
          overdue_stage: Database["public"]["Enums"]["overdue_stage"] | null
          penalty_amount: number | null
          penalty_rate: number | null
          period_month: string
          status: Database["public"]["Enums"]["overdue_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_overdue?: boolean
          loan_id: string
          overdue_days: number
          overdue_stage?: Database["public"]["Enums"]["overdue_stage"] | null
          penalty_amount?: number | null
          penalty_rate?: number | null
          period_month: string
          status?: Database["public"]["Enums"]["overdue_status"]
        }
        Update: {
          created_at?: string
          id?: string
          is_overdue?: boolean
          loan_id?: string
          overdue_days?: number
          overdue_stage?: Database["public"]["Enums"]["overdue_stage"] | null
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
      payment_voucher_sources: {
        Row: {
          account_code: string
          amount: number
          created_at: string
          id: string
          override_account_type:
            | Database["public"]["Enums"]["account_type"]
            | null
          override_gl_account_code: string | null
          override_reason: string | null
          pool: string
          role: string
          voucher_id: string
        }
        Insert: {
          account_code: string
          amount: number
          created_at?: string
          id?: string
          override_account_type?:
            | Database["public"]["Enums"]["account_type"]
            | null
          override_gl_account_code?: string | null
          override_reason?: string | null
          pool: string
          role?: string
          voucher_id: string
        }
        Update: {
          account_code?: string
          amount?: number
          created_at?: string
          id?: string
          override_account_type?:
            | Database["public"]["Enums"]["account_type"]
            | null
          override_gl_account_code?: string | null
          override_reason?: string | null
          pool?: string
          role?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_voucher_sources_override_gl_account_code_fkey"
            columns: ["override_gl_account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_voucher_sources_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvs_account_code_fk"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
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
          fund_source_id: string | null
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          loan_id: string | null
          notes: string | null
          payee_company_id: string | null
          payee_name: string
          payment_date: string | null
          payment_method: string
          payment_reference: string | null
          reference_id: string | null
          reference_type: string | null
          repayment_breakdown: Json | null
          source_pool: string | null
          status: Database["public"]["Enums"]["payment_voucher_status"]
          target_pool: string | null
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
          fund_source_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          loan_id?: string | null
          notes?: string | null
          payee_company_id?: string | null
          payee_name: string
          payment_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          repayment_breakdown?: Json | null
          source_pool?: string | null
          status?: Database["public"]["Enums"]["payment_voucher_status"]
          target_pool?: string | null
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
          fund_source_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          loan_id?: string | null
          notes?: string | null
          payee_company_id?: string | null
          payee_name?: string
          payment_date?: string | null
          payment_method?: string
          payment_reference?: string | null
          reference_id?: string | null
          reference_type?: string | null
          repayment_breakdown?: Json | null
          source_pool?: string | null
          status?: Database["public"]["Enums"]["payment_voucher_status"]
          target_pool?: string | null
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
            foreignKeyName: "payment_vouchers_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_source_outstanding"
            referencedColumns: ["fund_source_id"]
          },
          {
            foreignKeyName: "payment_vouchers_fund_source_id_fkey"
            columns: ["fund_source_id"]
            isOneToOne: false
            referencedRelation: "fund_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
            foreignKeyName: "payment_vouchers_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "payment_vouchers_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
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
      revenue_pay_lines: {
        Row: {
          id: string
          staff_id: string
          period_month: string
          kind: string
          description: string | null
          amount: number
          sort_order: number
          version: number
          created_by: string
          created_at: string
          updated_by: string
          updated_at: string
          claim_id: string | null
        }
        Insert: {
          id?: string
          staff_id: string
          period_month: string
          kind: string
          description?: string | null
          amount: number
          sort_order?: number
          version?: number
          created_by: string
          created_at?: string
          updated_by: string
          updated_at?: string
          claim_id?: string | null
        }
        Update: {
          id?: string
          staff_id?: string
          period_month?: string
          kind?: string
          description?: string | null
          amount?: number
          sort_order?: number
          version?: number
          created_by?: string
          created_at?: string
          updated_by?: string
          updated_at?: string
          claim_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "revenue_pay_lines_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "hr_staff_costs"; referencedColumns: ["id"] },
          { foreignKeyName: "revenue_pay_lines_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "revenue_pay_lines_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
        ]
      }
      revenue_payroll_commission_adjustments: {
        Row: {
          id: string
          payroll_row_id: string
          staff_id: string
          period_month: string
          old_synced_amount: number | null
          synced_amount: number
          old_adjustment_amount: number
          adjustment_amount: number
          old_gross: number
          gross: number
          reason: string
          adjusted_by: string
          adjusted_at: string
        }
        Insert: {
          id?: string
          payroll_row_id: string
          staff_id: string
          period_month: string
          old_synced_amount?: number | null
          synced_amount: number
          old_adjustment_amount: number
          adjustment_amount: number
          old_gross: number
          gross: number
          reason: string
          adjusted_by: string
          adjusted_at?: string
        }
        Update: {
          id?: string
          payroll_row_id?: string
          staff_id?: string
          period_month?: string
          old_synced_amount?: number | null
          synced_amount?: number
          old_adjustment_amount?: number
          adjustment_amount?: number
          old_gross?: number
          gross?: number
          reason?: string
          adjusted_by?: string
          adjusted_at?: string
        }
        Relationships: [
          { foreignKeyName: "revenue_payroll_commission_adjustments_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "hr_staff_costs"; referencedColumns: ["id"] },
          { foreignKeyName: "revenue_payroll_commission_adjustments_adjusted_by_fkey"; columns: ["adjusted_by"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] },
        ]
      }
      payroll_batch_lines: {
        Row: {
          batch_id: string
          bucket: string
          basic_pay_net: number
          commission_balance: number
          eis_ee: number
          eis_er: number
          epf_ee: number
          epf_er: number
          gross: number
          net: number
          non_statutory_allowance: number
          pcb: number
          skbbk: number
          socso_ee: number
          socso_er: number
          withholding_tax: number
          created_at: string
          ctc: number | null
          department_id: string | null
          department_name: string
          director_id: string | null
          employee_code: string | null
          employee_name: string
          id: string
          is_topup: boolean
          topup_kind: string | null
          period_month: string
          row_id: string
          scope: string
          segment_key: string
          snapshot: Json
          split_version: number | null
          staff_id: string | null
        }
        Insert: {
          batch_id: string
          bucket: string
          basic_pay_net?: number
          commission_balance?: number
          eis_ee?: number
          eis_er?: number
          epf_ee?: number
          epf_er?: number
          gross?: number
          net?: number
          non_statutory_allowance?: number
          pcb?: number
          skbbk?: number
          socso_ee?: number
          socso_er?: number
          withholding_tax?: number
          created_at?: string
          department_id?: string | null
          department_name: string
          director_id?: string | null
          employee_code?: string | null
          employee_name: string
          id?: string
          is_topup?: boolean
          topup_kind?: string | null
          period_month: string
          row_id: string
          scope: string
          segment_key: string
          snapshot?: Json
          split_version?: number | null
          staff_id?: string | null
        }
        Update: {
          batch_id?: string
          bucket?: string
          basic_pay_net?: number
          commission_balance?: number
          eis_ee?: number
          eis_er?: number
          epf_ee?: number
          epf_er?: number
          gross?: number
          net?: number
          non_statutory_allowance?: number
          pcb?: number
          skbbk?: number
          socso_ee?: number
          socso_er?: number
          withholding_tax?: number
          created_at?: string
          department_id?: string | null
          department_name?: string
          director_id?: string | null
          employee_code?: string | null
          employee_name?: string
          id?: string
          is_topup?: boolean
          topup_kind?: string | null
          period_month?: string
          row_id?: string
          scope?: string
          segment_key?: string
          snapshot?: Json
          split_version?: number | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_batch_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_batches: {
        Row: {
          batch_no: number
          departments: Json
          director_office_total: number
          director_total: number
          finance_total: number
          hr_total: number
          id: string
          it_total: number
          legacy: boolean
          marketing_total: number
          people: number
          period_month: string
          revenue_total: number
          run_id: string
          sent_back_at: string | null
          sent_back_by: string | null
          sent_back_by_name: string | null
          sent_back_reason: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          submitted_by_name: string | null
          second_payrolls: number
          topups: number
          total_amount: number | null
        }
        Insert: {
          batch_no: number
          departments?: Json
          director_office_total?: number
          director_total?: number
          finance_total?: number
          hr_total?: number
          id?: string
          it_total?: number
          legacy?: boolean
          marketing_total?: number
          people?: number
          period_month: string
          revenue_total?: number
          run_id: string
          sent_back_at?: string | null
          sent_back_by?: string | null
          sent_back_by_name?: string | null
          sent_back_reason?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          second_payrolls?: number
          topups?: number
        }
        Update: {
          batch_no?: number
          departments?: Json
          director_office_total?: number
          director_total?: number
          finance_total?: number
          hr_total?: number
          id?: string
          it_total?: number
          legacy?: boolean
          marketing_total?: number
          people?: number
          period_month?: string
          revenue_total?: number
          run_id?: string
          sent_back_at?: string | null
          sent_back_by?: string | null
          sent_back_by_name?: string | null
          sent_back_reason?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          second_payrolls?: number
          topups?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_batches_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_month_closes: {
        Row: {
          closed_at: string
          closed_by: string | null
          closed_by_name: string | null
          period_month: string
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          period_month: string
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          closed_by_name?: string | null
          period_month?: string
        }
        Relationships: []
      }
      payroll_payment_requests: {
        Row: {
          amount: number
          batch_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          notes: string | null
          payroll_run_id: string | null
          period_month: string | null
          pv_id: string | null
          requested_at: string
          requested_by: string
          source_bank_id: string | null
          status: Database["public"]["Enums"]["payroll_payment_request_status"]
          target_pool: string
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payroll_run_id?: string | null
          period_month?: string | null
          pv_id?: string | null
          requested_at?: string
          requested_by: string
          source_bank_id?: string | null
          status?: Database["public"]["Enums"]["payroll_payment_request_status"]
          target_pool?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payroll_run_id?: string | null
          period_month?: string | null
          pv_id?: string | null
          requested_at?: string
          requested_by?: string
          source_bank_id?: string | null
          status?: Database["public"]["Enums"]["payroll_payment_request_status"]
          target_pool?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payment_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_requests_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_requests_pv_id_fkey"
            columns: ["pv_id"]
            isOneToOne: false
            referencedRelation: "payment_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_requests_source_bank_id_fkey"
            columns: ["source_bank_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approval_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          director_office_total: number
          director_salary_total: number
          finance_opex_total: number
          hr_opex_total: number
          id: string
          it_opex_total: number
          marketing_opex_total: number
          revenue_opex_total: number
          paid_at: string | null
          period_month: string
          rejected_at: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["payroll_run_status"]
          submitted_at: string | null
          submitted_by: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          director_office_total?: number
          director_salary_total?: number
          finance_opex_total?: number
          hr_opex_total?: number
          id?: string
          it_opex_total?: number
          marketing_opex_total?: number
          revenue_opex_total?: number
          paid_at?: string | null
          period_month: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payroll_run_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          director_office_total?: number
          director_salary_total?: number
          finance_opex_total?: number
          hr_opex_total?: number
          id?: string
          it_opex_total?: number
          marketing_opex_total?: number
          revenue_opex_total?: number
          paid_at?: string | null
          period_month?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["payroll_run_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests_with_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      permission_defs: {
        Row: {
          description: string | null
          key: string
          label: string
          scope: string
          section: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          key: string
          label: string
          scope: string
          section: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          key?: string
          label?: string
          scope?: string
          section?: string
          sort_order?: number
        }
        Relationships: []
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
      report_layouts: {
        Row: {
          layout: Json
          report_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          layout?: Json
          report_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          layout?: Json
          report_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_layouts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_default_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_default_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_defs"
            referencedColumns: ["key"]
          },
        ]
      }
      sales_import_batches: {
        Row: {
          cancelled_count: number
          created_at: string
          file_hash: string | null
          file_name: string
          id: string
          imported_by: string | null
          notes: string | null
          order_count: number
          out_of_period_count: number
          period_month: string
          row_count: number
          sheet_name: string | null
          status: Database["public"]["Enums"]["sales_import_status"]
          superseded_at: string | null
          unmatched_agent_count: number
        }
        Insert: {
          cancelled_count?: number
          created_at?: string
          file_hash?: string | null
          file_name: string
          id?: string
          imported_by?: string | null
          notes?: string | null
          order_count?: number
          out_of_period_count?: number
          period_month: string
          row_count?: number
          sheet_name?: string | null
          status?: Database["public"]["Enums"]["sales_import_status"]
          superseded_at?: string | null
          unmatched_agent_count?: number
        }
        Update: {
          cancelled_count?: number
          created_at?: string
          file_hash?: string | null
          file_name?: string
          id?: string
          imported_by?: string | null
          notes?: string | null
          order_count?: number
          out_of_period_count?: number
          period_month?: string
          row_count?: number
          sheet_name?: string | null
          status?: Database["public"]["Enums"]["sales_import_status"]
          superseded_at?: string | null
          unmatched_agent_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          brand_code: string | null
          cost_amount: number | null
          description2: string | null
          id: string
          item_group: string
          line_amount: number
          line_no: number
          location: string | null
          order_id: string
          product_code: string
          product_name: string | null
          qty: number
          raw: Json | null
          unit_price: number
          uom: string | null
        }
        Insert: {
          brand_code?: string | null
          cost_amount?: number | null
          description2?: string | null
          id?: string
          item_group: string
          line_amount?: number
          line_no: number
          location?: string | null
          order_id: string
          product_code: string
          product_name?: string | null
          qty?: number
          raw?: Json | null
          unit_price?: number
          uom?: string | null
        }
        Update: {
          brand_code?: string | null
          cost_amount?: number | null
          description2?: string | null
          id?: string
          item_group?: string
          line_amount?: number
          line_no?: number
          location?: string | null
          order_id?: string
          product_code?: string
          product_name?: string | null
          qty?: number
          raw?: Json | null
          unit_price?: number
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_open_bill_tags: {
        Row: {
          auto_suggested: boolean
          bill_rank: number
          event_date: string
          id: string
          order_id: string
          staff_id: string
          tagged_at: string
          tagged_by: string | null
        }
        Insert: {
          auto_suggested?: boolean
          bill_rank: number
          event_date: string
          id?: string
          order_id: string
          staff_id: string
          tagged_at?: string
          tagged_by?: string | null
        }
        Update: {
          auto_suggested?: boolean
          bill_rank?: number
          event_date?: string
          id?: string
          order_id?: string
          staff_id?: string
          tagged_at?: string
          tagged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_open_bill_tags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_open_bill_tags_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_open_bill_tags_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          agent_key: string
          agent_name: string
          balance: number | null
          batch_id: string
          bill_ref: string | null
          brand_code: string | null
          cancelled: boolean
          created_at: string
          customer_name: string | null
          debtor_code: string | null
          event_date: string
          id: string
          location: string | null
          manual_margin_at: string | null
          manual_margin_by: string | null
          manual_margin_pct: number | null
          order_date: string
          order_no: string
          order_total: number
          paid_amount: number | null
          period_month: string
          raw: Json | null
          sequence_in_day: number | null
          staff_id: string | null
        }
        Insert: {
          agent_key: string
          agent_name: string
          balance?: number | null
          batch_id: string
          bill_ref?: string | null
          brand_code?: string | null
          cancelled?: boolean
          created_at?: string
          customer_name?: string | null
          debtor_code?: string | null
          event_date: string
          id?: string
          location?: string | null
          manual_margin_at?: string | null
          manual_margin_by?: string | null
          manual_margin_pct?: number | null
          order_date: string
          order_no: string
          order_total?: number
          paid_amount?: number | null
          period_month: string
          raw?: Json | null
          sequence_in_day?: number | null
          staff_id?: string | null
        }
        Update: {
          agent_key?: string
          agent_name?: string
          balance?: number | null
          batch_id?: string
          bill_ref?: string | null
          brand_code?: string | null
          cancelled?: boolean
          created_at?: string
          customer_name?: string | null
          debtor_code?: string | null
          event_date?: string
          id?: string
          location?: string | null
          manual_margin_at?: string | null
          manual_margin_by?: string | null
          manual_margin_pct?: number | null
          order_date?: string
          order_no?: string
          order_total?: number
          paid_amount?: number | null
          period_month?: string
          raw?: Json | null
          sequence_in_day?: number | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "sales_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_manual_margin_by_fkey"
            columns: ["manual_margin_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "hr_staff_costs"
            referencedColumns: ["id"]
          },
        ]
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
      title_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          rank: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rank: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      title_permissions: {
        Row: {
          permission_key: string
          title_id: string
        }
        Insert: {
          permission_key: string
          title_id: string
        }
        Update: {
          permission_key?: string
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "title_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_defs"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "title_permissions_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          is_active: boolean
          is_department_head: boolean
          level_id: string | null
          name: string
          sort_order: number
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_department_head?: boolean
          level_id?: string | null
          name: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_department_head?: boolean
          level_id?: string | null
          name?: string
          sort_order?: number
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "titles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titles_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "title_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_terms_history: {
        Row: {
          compound_interest: boolean
          created_at: string
          created_by: string | null
          id: string
          months: number | null
          rate: number
          reason: string | null
          record_id: string
          record_kind: string
          valid_from: string
          valid_to: string
          was_effective_from: string | null
          was_maturity_date: string | null
          was_repayment_terms: string | null
        }
        Insert: {
          compound_interest?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          months?: number | null
          rate: number
          reason?: string | null
          record_id: string
          record_kind: string
          valid_from: string
          valid_to: string
          was_effective_from?: string | null
          was_maturity_date?: string | null
        }
        Update: {
          compound_interest?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          months?: number | null
          rate?: number
          reason?: string | null
          record_id?: string
          record_kind?: string
          valid_from?: string
          valid_to?: string
          was_effective_from?: string | null
          was_maturity_date?: string | null
        }
        Relationships: []
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
      user_permissions: {
        Row: {
          granted: boolean
          permission_key: string
          user_id: string
        }
        Insert: {
          granted: boolean
          permission_key: string
          user_id: string
        }
        Update: {
          granted?: boolean
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_defs"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      table_layout_defaults: {
        Row: {
          layout: Json
          set_at: string
          set_by: string | null
          table_id: string
        }
        Insert: {
          layout: Json
          set_at?: string
          set_by?: string | null
          table_id: string
        }
        Update: {
          layout?: Json
          set_at?: string
          set_by?: string | null
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_layout_defaults_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_table_layouts: {
        Row: {
          layout: Json
          table_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          layout: Json
          table_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          layout?: Json
          table_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_table_layouts_user_id_fkey"
            columns: ["user_id"]
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
          last_seen_at: string | null
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
          last_seen_at?: string | null
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
          last_seen_at?: string | null
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
      venture_pool: {
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
            foreignKeyName: "venture_pool_created_by_fkey"
            columns: ["created_by"]
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
          from_department_id: string | null
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
          {
            foreignKeyName: "fund_sources_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
      hr_monthly_payroll_summary: {
        Row: {
          department_id: string | null
          department_name: string | null
          dept_ee_deductions: number | null
          dept_eis_er: number | null
          dept_epf_er: number | null
          dept_gross: number | null
          dept_net: number | null
          dept_socso_er: number | null
          dept_stat_er: number | null
          period_month: string | null
          staff_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_costs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
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
      venture_pool_balance: {
        Row: {
          balance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_payroll_statutory_selection: {
        Args: {
          p_period: string
          p_schemes: string[]
          p_scope: string
          p_granularity: string
          p_department_id?: string | null
          p_payroll_row_ids?: string[] | null
          p_payment_date?: string | null
          p_expected_total?: number | null
          p_expected_count?: number | null
        }
        Returns: Json
      }
      amend_fund_source: {
        Args: { p_fund_source_id: string; p_payload: Json }
        Returns: undefined
      }
      amend_loan: {
        Args: { p_loan_id: string; p_payload: Json }
        Returns: undefined
      }
      amend_loan_repayment: {
        Args: { p_new_amount: number; p_reason: string; p_repayment_id: string }
        Returns: Json
      }
      adjust_revenue_payroll_commission: { Args: { p_payroll_id: string; p_gross: number; p_expected_synced: number; p_expected_adjustment: number; p_reason: string }; Returns: Json }
      save_revenue_payroll_row: {
        Args: { p_payroll_id: string; p_gross: number; p_expected_synced: number; p_expected_adjustment: number; p_reason: string; p_row_updates?: Json }
        Returns: Json
      }
      revenue_pay_line_totals: {
        Args: { p_staff_id: string; p_period: string }
        Returns: { earnings: number; deductions: number }[]
      }
      revenue_pay_lines_closed: { Args: { p_period: string }; Returns: string | null }
      revenue_save_pay_lines: {
        Args: { p_staff_id: string; p_period: string; p_lines: Json; p_seen: Json }
        Returns: Json
      }
      revenue_payroll_adjustments: {
        Args: { p_sub_department_id: string; p_period: string; p_staff_id?: string | null }
        Returns: {
          staff_id: string
          commission_synced_amount: number | null
          commission_adjustment_amount: number
          commission_adjustment_reason: string | null
          commission_amount: number
          status: string
          commission_adjusted_at: string | null
          source_run_count: number
        }[]
      }
      apply_commission_run: { Args: { p_run_id: string }; Returns: Json }
      apply_pool_adjustment: {
        Args: {
          p_amount: number
          p_approval_id: string
          p_description: string
          p_direction: string
          p_loan_id?: string
          p_now: string
          p_pool: string
          p_user_id: string
        }
        Returns: undefined
      }
      approve_dept_payment_expense: {
        Args: { p_approval_id: string }
        Returns: undefined
      }
      approve_payroll_run: {
        Args: { p_approver: string; p_run_id: string }
        Returns: undefined
      }
      approve_single_voucher: {
        Args: {
          p_allow_overdraw?: boolean
          p_approval_id: string
          p_notes: string
          p_user_id: string
        }
        Returns: {
          voucher_id: string
          voucher_no: string
        }[]
      }
      approve_voucher_batch: {
        Args: { p_group_id: string; p_notes: string; p_user_id: string }
        Returns: {
          voucher_id: string
          voucher_no: string
        }[]
      }
      approve_voucher_batch_partial: {
        Args: {
          p_approve_ids: string[]
          p_approve_notes: string
          p_group_id: string
          p_reject_ids: string[]
          p_reject_reason: string
          p_user_id: string
        }
        Returns: {
          outcome: string
          voucher_id: string
          voucher_no: string
        }[]
      }
      bank_gl_codes: { Args: never; Returns: string[] }
      billing_mode_to_segment: {
        Args: { p_mode: string }
        Returns: Database["public"]["Enums"]["gl_segment"]
      }
      bridge_mirror_slices: { Args: never; Returns: Json }
      bridge_ref_flags: { Args: never; Returns: Json }
      build_hr_cost_submission_payload: {
        Args: { p_period: string }
        Returns: {
          dept_summaries: Json
          pool_allocation_snapshot: Json
          staff_allocation_snapshot: Json
          staff_snapshot: Json
        }[]
      }
      bump_bank_balance: {
        Args: { p_bank_account_id: string; p_delta: number }
        Returns: number
      }
      bump_bank_for_paid_credit: {
        Args: { p_voucher_id: string }
        Returns: undefined
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
      cancel_dept_payment_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      cancel_loan_and_approval:
        | { Args: { p_loan_id: string }; Returns: undefined }
        | {
            Args: { p_cancel_reason?: string; p_loan_id: string }
            Returns: undefined
          }
      change_account_type: {
        Args: { p_new_type: string; p_old: string }
        Returns: Json
      }
      claim_create_payment_voucher: {
        Args: { p_bank: string; p_claim: string; p_method: string }
        Returns: string
      }
      claim_payment_queue: {
        Args: never
        Returns: {
          amount: number
          approved_at: string | null
          approved_by_name: string | null
          claim_id: string
          claim_type: string
          claimant_name: string
          department: string | null
          description: string | null
          request_no: string | null
          source_pool: string | null
          voucher_id: string | null
          voucher_no: string | null
          voucher_status: string | null
        }[]
      }
      close_approvals_for_voided_voucher: {
        Args: { p_voucher_id: string }
        Returns: number
      }
      coa_is_header: { Args: { p_code: string }; Returns: boolean }
      compute_commission: {
        Args: { p_period: string; p_staff_id: string }
        Returns: number
      }
      create_loan_with_approval: {
        Args: {
          p_bank_account_id?: string
          p_base_rate: number
          p_company_id: string
          p_company_name?: string
          p_disbursement_account_code?: string
          p_disbursement_date?: string
          p_effective_rate: number
          p_principal: number
          p_repayment_terms?: string
          p_risk_premium: number
          p_tenure_months: number
        }
        Returns: string
      }
      create_manual_journal_voucher: {
        Args: {
          p_description: string
          p_lines: Json
          p_segment?: string
          p_transaction_date: string
        }
        Returns: string
      }
      create_payroll_disbursement_vouchers: {
        Args: {
          p_payment_date: string
          p_period: string
          p_scope: string
          p_granularity?: string
          p_department_id?: string | null
          p_payroll_row_ids?: string[] | null
          p_component_selections?: Json | null
        }
        Returns: Json
      }
      create_payroll_statutory_director_topup: {
        Args: {
          p_bank_account_id?: string
          p_payment_date?: string
          p_period: string
          p_scheme: string
        }
        Returns: Json
      }
      create_payroll_statutory_vouchers: {
        Args: {
          p_bank_account_id?: string
          p_payment_date?: string
          p_period: string
          p_scheme: string
        }
        Returns: Json
      }
      current_permissions: { Args: never; Returns: string[] }
      current_user_department_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      current_user_segment: {
        Args: never
        Returns: Database["public"]["Enums"]["gl_segment"]
      }
      dashboard_summary: { Args: never; Returns: Json }
      delete_manual_journal_voucher: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      department_modes: {
        Args: never
        Returns: {
          can_switch: boolean
          cost_model: string
          id: string
          is_internal: boolean
          name: string
          open_split_people: number
          segment_key: string | null
        }[]
      }
      department_set_cost_model: {
        Args: { p_cost_model: string; p_department_id: string }
        Returns: Json
      }
      dept_invoice_settlements: {
        Args: { p_segment?: Database["public"]["Enums"]["gl_segment"] }
        Returns: {
          credits: number
          invoice_id: string
          receipts: number
        }[]
      }
      dept_pool_gl_code: { Args: { p_dept_name: string }; Returns: string }
      dept_request_pv_rejected: {
        Args: { p_voucher_id: string }
        Returns: undefined
      }
      dept_to_segment: {
        Args: { p_dept_name: string }
        Returns: Database["public"]["Enums"]["gl_segment"]
      }
      derive_journal_segment: {
        Args: { p_reference_id: string; p_reference_type: string }
        Returns: Database["public"]["Enums"]["gl_segment"]
      }
      execute_fund_source_cancel: {
        Args: { p_fund_source_id: string }
        Returns: string
      }
      execute_loan_cancel: { Args: { p_loan_id: string }; Returns: string }
      format_invoice_no: { Args: { p_period: string }; Returns: string }
      generate_invoices_from_request: {
        Args: { p_request_id: string }
        Returns: string[]
      }
      generate_monthly_invoices: {
        Args: { p_modes?: string[]; p_period_month: string }
        Returns: Json
      }
      generate_pv_for_dept_request: {
        Args: {
          p_pay_from_account_id: string
          p_payment_method: string
          p_request_id: string
        }
        Returns: string
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
      get_dept_opex_rows: {
        Args: {
          p_dept_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: {
          basic_salary: number
          commission_amount: number
          eis_er: number
          employee_name: string
          epf_er: number
          non_statutory_allowance: number
          period_month: string
          socso_er: number
          statutory_allowance: number
        }[]
      }
      get_director_advance_opening_balance: {
        Args: { p_director_id: string; p_period: string }
        Returns: number
      }
      get_director_ctc_by_company: {
        Args: { p_period_month: string }
        Returns: {
          allowance: number
          basic: number
          company_id: string
          company_name: string
          company_short_code: string
          eis_er: number
          epf_er: number
          kpi: number
          socso_er: number
          total_ctc: number
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
      get_hr_cost_submissions_list: {
        Args: never
        Returns: {
          dept_summaries: Json
          execution_state: string
          id: string
          period_month: string
          submitted_at: string
          submitted_by_name: string
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
      get_payroll_accrual_totals: {
        Args: { p_period: string }
        Returns: {
          segment: string
          total_amount: number
        }[]
      }
      get_payroll_breakdown_by_pool: {
        Args: { p_request_id: string }
        Returns: {
          dept_name: string
          pool_balance: number
          pool_key: string
          required_amount: number
        }[]
      }
      get_payroll_funding_paid: {
        Args: { p_request_id: string }
        Returns: number
      }
      get_staff_billing_allocation: {
        Args: { p_period_month: string }
        Returns: {
          allowance_amount: number
          amount: number
          company_id: string
          company_name: string
          company_short_code: string
          department_id: string
          department_name: string
          eis_amount: number
          epf_amount: number
          salary_amount: number
          socso_amount: number
          staff_count: number
        }[]
      }
      get_staff_own_share_allocation: {
        Args: { p_period_month: string }
        Returns: {
          allowance_amount: number
          amount: number
          department_id: string
          department_name: string
          eis_amount: number
          epf_amount: number
          salary_amount: number
          socso_amount: number
          staff_count: number
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
      gl_net_by_account: {
        Args: { p_before: string; p_codes?: string[] }
        Returns: {
          account_code: string
          net: number
        }[]
      }
      has_perm: { Args: { p_key: string }; Returns: boolean }
      has_scope: { Args: { p_scopes: string[] }; Returns: boolean }
      hr_dashboard_summary: { Args: { p_period?: string }; Returns: Json }
      is_period_locked: { Args: { p_date: string }; Returns: boolean }
      jv_apply_bank_cache: {
        Args: { p_entry_id: string; p_sign: number }
        Returns: undefined
      }
      ladder_delete_level: { Args: { p_id: string }; Returns: undefined }
      ladder_insert_level: {
        Args: { p_name: string; p_rank: number }
        Returns: string
      }
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
      mark_journal_entry_reversed: {
        Args: { p_original_id: string; p_reversal_id: string }
        Returns: undefined
      }
      mark_matured_fund_sources: { Args: never; Returns: number }
      mint_credit_note_no: { Args: { p_period?: string }; Returns: string }
      mint_invoice_no: { Args: { p_period: string }; Returns: string }
      next_account_code: {
        Args: { p_type: Database["public"]["Enums"]["account_type"] }
        Returns: string
      }
      pool_key_to_segment: {
        Args: { p_pool: string }
        Returns: Database["public"]["Enums"]["gl_segment"]
      }
      post_journal_entry: {
        Args: {
          p_created_by: string
          p_description: string
          p_lines: Json
          p_reference_id: string
          p_reference_type: string
          p_segment?: Database["public"]["Enums"]["gl_segment"]
          p_transaction_date: string
        }
        Returns: string
      }
      post_journal_entry_as_caller: {
        Args: {
          p_created_by: string
          p_description: string
          p_lines: Json
          p_reference_id: string
          p_reference_type: string
          p_segment?: Database["public"]["Enums"]["gl_segment"]
          p_transaction_date: string
        }
        Returns: string
      }
      provision_full_department: {
        Args: { p_department_id: string; p_segment_key: string }
        Returns: Json
      }
      reassign_invoice_gl_account: {
        Args: {
          p_invoice_id: string
          p_new_account: string
          p_old_account?: string
          p_reason: string
        }
        Returns: Json
      }
      reassign_voucher_gl_account: {
        Args: {
          p_new_account: string
          p_old_account: string
          p_reason: string
          p_voucher_id: string
        }
        Returns: number
      }
      refresh_base_rate: { Args: { p_op_margin: number }; Returns: string }
      reject_dept_payment_request: {
        Args: { p_approval_id: string }
        Returns: undefined
      }
      reject_invoice_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      reject_payroll_run: {
        Args: { p_approver: string; p_reason: string; p_run_id: string }
        Returns: undefined
      }
      rename_account_code: {
        Args: { p_new: string; p_old: string }
        Returns: Json
      }
      reopen_commission_run: { Args: { p_run_id: string }; Returns: Json }
      reopen_director_salary: {
        Args: { p_period: string; p_user_id: string }
        Returns: undefined
      }
      reopen_payroll_run: {
        Args: { p_period: string; p_user_id: string }
        Returns: string
      }
      request_loan_cancel: {
        Args: { p_loan_id: string; p_reason?: string }
        Returns: string
      }
      return_voucher_to_draft: {
        Args: { p_voucher_id: string }
        Returns: undefined
      }
      reverse_staff_payroll_accruals: {
        Args: { p_period: string; p_user_id: string }
        Returns: number
      }
      reverse_voucher_pool_rows: {
        Args: { p_voucher_no: string }
        Returns: number
      }
      rnp_invoice_events: {
        Args: { p_segment?: string }
        Returns: {
          amount: number
          company_id: string
          event_date: string
          event_kind: string
          invoice_id: string
          invoice_no: string
          party_fallback: string
        }[]
      }
      save_commission_run: {
        Args: {
          p_batch_id: string
          p_deferred_orders: Json
          p_penalised_orders: Json
          p_period_month: string
          p_released_orders: Json
          p_scheme_id: string
          p_statements: Json
          p_sub_department_id: string
          p_total_commission: number
          p_warnings: Json
        }
        Returns: string
      }
      save_director_salary_results: { Args: { p_data: Json }; Returns: Json }
      set_fund_source_min_pay_interest: {
        Args: { p_fund_source_id: string; p_value: boolean }
        Returns: undefined
      }
      set_fund_source_notes: {
        Args: { p_fund_source_id: string; p_notes: string }
        Returns: undefined
      }
      set_fund_source_repayment_start: {
        Args: { p_fund_source_id: string; p_month: string }
        Returns: undefined
      }
      set_loan_funding_source: {
        Args: { p_loan_id: string; p_source: string }
        Returns: undefined
      }
      set_loan_min_pay_interest: {
        Args: { p_loan_id: string; p_value: boolean }
        Returns: undefined
      }
      set_loan_repayment_start: {
        Args: { p_loan_id: string; p_month: string }
        Returns: undefined
      }
      set_payroll_pv_payment_date: {
        Args: { p_payment_date: string; p_voucher_id: string }
        Returns: undefined
      }
      submit_dept_payment_request: {
        Args: {
          p_amount: number
          p_category_code?: string
          p_description: string
          p_payee_company_id: string
          p_payee_name: string
        }
        Returns: string
      }
      submit_director_salary_to_finance: {
        Args: { p_period: string; p_user_id: string }
        Returns: string
      }
      submit_invoice_request: {
        Args: {
          p_description: string
          p_due_date: string
          p_invoice_date: string
          p_line_items: Json
          p_period_month: string
          p_reference_no: string
        }
        Returns: string
      }
      director_payroll_complete: {
        Args: { p_period: string }
        Returns: Json
      }
      director_payroll_uncomplete: {
        Args: { p_period: string }
        Returns: number
      }
      get_payroll_accrual_totals_for: {
        Args: { p_reference_id: string }
        Returns: {
          segment: string
          total_amount: number
        }[]
      }
      payroll_batch_accrual_sums: {
        Args: { p_batch_id: string }
        Returns: {
          segment: string
          gross: number
          non_statutory_allowance: number
          epf_er: number
          epf_ee: number
          socso_er: number
          socso_ee: number
          eis_er: number
          eis_ee: number
          pcb: number
          withholding_tax: number
          net: number
          skbbk: number
        }[]
      }
      payroll_cancel_topup: {
        Args: { p_scope: string; p_row_id: string }
        Returns: undefined
      }
      payroll_close_month: {
        Args: { p_period: string }
        Returns: undefined
      }
      payroll_complete_rows: {
        Args: { p_period: string; p_row_ids: string[] }
        Returns: Json
      }
      payroll_month_closed: {
        Args: { p_period: string }
        Returns: boolean
      }
      payroll_month_status: {
        Args: { p_period: string }
        Returns: Json
      }
      payroll_open_topup: {
        Args: { p_kind?: string; p_row_id: string; p_scope: string }
        Returns: undefined
      }
      payroll_reopen_month: {
        Args: { p_period: string; p_reason: string }
        Returns: undefined
      }
      payroll_row_delta: {
        Args: { p_scope: string; p_row_id: string }
        Returns: Json
      }
      payroll_send_back_batch: {
        Args: { p_batch_id: string; p_reason?: string }
        Returns: undefined
      }
      payroll_submit_batch: {
        Args: { p_period: string; p_expected_people: number; p_expected_total: number }
        Returns: string
      }
      payroll_uncomplete_rows: {
        Args: { p_period: string; p_row_ids: string[] }
        Returns: number
      }
      submit_payroll_to_principal: {
        Args: { p_period: string; p_user_id: string }
        Returns: string
      }
      terms_with_funding_source: {
        Args: { p_source: string; p_terms: string }
        Returns: string
      }
      update_manual_journal_voucher: {
        Args: {
          p_description: string
          p_entry_id: string
          p_lines: Json
          p_segment?: string
          p_transaction_date: string
        }
        Returns: undefined
      }
      delete_voucher_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      amend_fund_source_from: {
        Args: {
          p_compound_interest: boolean | null
          p_cost_rate: number | null
          p_effective_from: string
          p_fund_source_id: string
          p_no_fixed_term?: boolean
          p_reason: string | null
          p_remaining_months: number | null
        }
        Returns: undefined
      }
      amend_loan_from: {
        Args: {
          p_compound_interest: boolean | null
          p_effective_from: string
          p_effective_rate: number | null
          p_loan_id: string
          p_no_fixed_term?: boolean
          p_reason: string | null
          p_remaining_months: number | null
        }
        Returns: undefined
      }
      revert_terms_change: {
        Args: { p_record_id: string; p_record_kind: string }
        Returns: undefined
      }
      void_issued_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: number
      }
      void_loan_repayment: { Args: { p_repayment_id: string }; Returns: Json }
      voucher_party_refs: { Args: never; Returns: Json }
      withdraw_pending_fund_source: {
        Args: { p_fund_source_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "fixed_asset"
        | "cost"
        | "other_income"
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
        | "new_fund_source"
        | "hr_costing"
        | "payroll_run"
        | "dept_payment_request"
        | "loan_cancel"
      approval_status: "pending" | "approved" | "rejected"
      approval_workflow_state:
        | "submitted"
        | "under_review"
        | "needs_info"
        | "delegated"
        | "approved"
        | "rejected"
        | "expired"
      billable_to_kind: "subsidiary" | "director" | "dept_pool" | "freetext"
      billing_mode:
        | "marketing_project"
        | "non_billable"
        | "director_office_attribution"
        | "director_attribution"
        | "hr_attribution"
        | "finance_attribution"
        | "venture_attribution"
        | "payroll_consolidated"
        | "revenue_department_attribution"
        | "it_attribution"
      cash_flow_category: "operating" | "investing" | "financing"
      claim_status: "pending" | "approved" | "rejected" | "paid"
      claim_type: "project" | "benefit"
      comm_component:
        | "product_revenue"
        | "kpi_item"
        | "kpi_threshold"
        | "open_bill"
        | "override"
        | "margin_incentive"
      comm_margin_band_kind: "incentive" | "reference" | "penalty"
      comm_open_bill_basis: "uplift_on_commission" | "pct_of_revenue"
      comm_promotion_criterion:
        | "personal_sales"
        | "group_sales"
        | "kpi_items_per_pax"
        | "margin_band"
      comm_rate_mode: "fixed" | "variable"
      comm_run_status: "draft" | "computed" | "applied" | "locked"
      commission_base_source:
        | "staff_sales_count"
        | "staff_sales_amount"
        | "dept_np"
        | "company_sales"
        | "team_commission_sum"
      commission_rule_type: "tiered_per_unit" | "pct_of_base"
      contract_status: "active" | "completed" | "cancelled"
      dept_payment_request_status:
        | "pending_principal_expense"
        | "rejected_expense"
        | "pending_finance_pv"
        | "pending_principal_pv"
        | "completed"
        | "cancelled"
      dept_pool_txn_type:
        | "np_in"
        | "expense_out"
        | "inter_billing_out"
        | "void_in"
        | "void_out"
        | "jv_in"
        | "jv_out"
      director_status: "active" | "inactive"
      epf_part: "A" | "C" | "E" | "F"
      fund_source_status:
        | "pending_approval"
        | "active"
        | "matured"
        | "repaid"
        | "cancelled"
      fund_source_type:
        | "subsidiary"
        | "director_loan"
        | "department_pool"
        | "director_saving"
        | "outsource"
      gl_segment:
        | "treasury"
        | "marketing"
        | "hr"
        | "finance"
        | "director_office"
        | "corporate"
        | "unallocated"
        | "director"
        | "revenue_department"
        | "it"
      hr_employment_type: "salaried" | "commission_eligible" | "variable"
      hr_monthly_payroll_source:
        | "imported"
        | "manual"
        | "carried_forward"
        | "commission"
      hr_monthly_payroll_status: "draft" | "completed" | "submitted" | "paid"
      hr_staff_status: "active" | "inactive"
      hr_tax_mode: "pcb" | "withholding" | "none"
      hv_fund_txn_type:
        | "profit_in"
        | "expense_out"
        | "fund_in"
        | "fund_out"
        | "loan_repayment_in"
      invoice_pool_txn_type: "accumulate" | "release"
      invoice_status: "draft" | "issued" | "paid" | "paid_via_netting" | "voided"
      invoice_submission_request_status:
        | "pending"
        | "generated"
        | "rejected"
        | "cancelled"
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
        | "payroll_bank_transfer"
        | "loan_disbursement"
      payout_status: "draft" | "confirmed" | "paid"
      payroll_payment_request_status:
        | "submitted"
        | "pv_generated"
        | "completed"
        | "cancelled"
      payroll_run_status:
        | "draft"
        | "submitted"
        | "approved"
        | "paid"
        | "rejected"
      pcb_category: "KA1" | "KA2" | "KA3"
      repayment_type: "principal" | "interest" | "penalty" | "netting"
      sales_import_status: "draft" | "committed" | "superseded"
      socso_category: "first" | "second"
      statement_direction: "receivable" | "payable"
      statement_line_type: "invoice" | "contra"
      statement_status: "draft" | "issued" | "paid" | "partial" | "overdue"
      user_role: "principal" | "finance" | "hr" | "dept_manager" | "revenue_member" | "staff"
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
      account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "fixed_asset",
        "cost",
        "other_income",
      ],
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
        "new_fund_source",
        "hr_costing",
        "payroll_run",
        "dept_payment_request",
        "loan_cancel",
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
      billable_to_kind: ["subsidiary", "director", "dept_pool", "freetext"],
      billing_mode: [
        "marketing_project",
        "non_billable",
        "director_office_attribution",
        "director_attribution",
        "hr_attribution",
        "finance_attribution",
        "venture_attribution",
        "payroll_consolidated",
        "revenue_department_attribution",
        "it_attribution",
      ],
      cash_flow_category: ["operating", "investing", "financing"],
      claim_status: ["pending", "approved", "rejected", "paid"],
      claim_type: ["project", "benefit"],
      comm_component: [
        "product_revenue",
        "kpi_item",
        "kpi_threshold",
        "open_bill",
        "override",
        "margin_incentive",
      ],
      comm_margin_band_kind: ["incentive", "reference", "penalty"],
      comm_open_bill_basis: ["uplift_on_commission", "pct_of_revenue"],
      comm_promotion_criterion: [
        "personal_sales",
        "group_sales",
        "kpi_items_per_pax",
        "margin_band",
      ],
      comm_rate_mode: ["fixed", "variable"],
      comm_run_status: ["draft", "computed", "applied", "locked"],
      commission_base_source: [
        "staff_sales_count",
        "staff_sales_amount",
        "dept_np",
        "company_sales",
        "team_commission_sum",
      ],
      commission_rule_type: ["tiered_per_unit", "pct_of_base"],
      contract_status: ["active", "completed", "cancelled"],
      dept_payment_request_status: [
        "pending_principal_expense",
        "rejected_expense",
        "pending_finance_pv",
        "pending_principal_pv",
        "completed",
        "cancelled",
      ],
      dept_pool_txn_type: [
        "np_in",
        "expense_out",
        "inter_billing_out",
        "void_in",
        "void_out",
        "jv_in",
        "jv_out",
      ],
      director_status: ["active", "inactive"],
      epf_part: ["A", "C", "E", "F"],
      fund_source_status: [
        "pending_approval",
        "active",
        "matured",
        "repaid",
        "cancelled",
      ],
      fund_source_type: [
        "subsidiary",
        "director_loan",
        "department_pool",
        "director_saving",
        "outsource",
      ],
      gl_segment: [
        "treasury",
        "marketing",
        "hr",
        "finance",
        "director_office",
        "corporate",
        "unallocated",
        "director",
        "revenue_department",
        "it",
      ],
      hr_employment_type: ["salaried", "commission_eligible", "variable"],
      hr_monthly_payroll_source: [
        "imported",
        "manual",
        "carried_forward",
        "commission",
      ],
      hr_monthly_payroll_status: ["draft", "completed", "submitted", "paid"],
      hr_staff_status: ["active", "inactive"],
      hr_tax_mode: ["pcb", "withholding", "none"],
      hv_fund_txn_type: [
        "profit_in",
        "expense_out",
        "fund_in",
        "fund_out",
        "loan_repayment_in",
      ],
      invoice_pool_txn_type: ["accumulate", "release"],
      invoice_status: ["draft", "issued", "paid", "paid_via_netting", "voided"],
      invoice_submission_request_status: [
        "pending",
        "generated",
        "rejected",
        "cancelled",
      ],
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
        "payroll_bank_transfer",
        "loan_disbursement",
      ],
      payout_status: ["draft", "confirmed", "paid"],
      payroll_payment_request_status: [
        "submitted",
        "pv_generated",
        "completed",
        "cancelled",
      ],
      payroll_run_status: [
        "draft",
        "submitted",
        "approved",
        "paid",
        "rejected",
      ],
      pcb_category: ["KA1", "KA2", "KA3"],
      repayment_type: ["principal", "interest", "penalty", "netting"],
      sales_import_status: ["draft", "committed", "superseded"],
      socso_category: ["first", "second"],
      statement_direction: ["receivable", "payable"],
      statement_line_type: ["invoice", "contra"],
      statement_status: ["draft", "issued", "paid", "partial", "overdue"],
      user_role: ["principal", "finance", "hr", "dept_manager", "revenue_member", "staff"],
    },
  },
} as const
