import type {
  AppRole,
  ClientReportStatus,
  DepartmentSubmissionStatus,
  Importance,
  ItemPeriod,
  NoticeType,
  UserRegistrationStatus,
  VolumeType,
  VolumeUnit
} from "./enums";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Tables = {
  departments: {
    Row: {
      id: string;
      department_code: string;
      department_name: string;
      notes: string | null;
      is_active: boolean;
      sort_order: number;
      created_at: string;
      created_by: string | null;
      updated_at: string;
      updated_by: string | null;
    };
    Insert: Partial<Tables["departments"]["Row"]> & {
      department_code: string;
      department_name: string;
    };
    Update: Partial<Tables["departments"]["Row"]>;
  };
  profiles: {
    Row: {
      id: string;
      email: string;
      employee_no: string;
      full_name: string;
      department_id: string | null;
      app_role: AppRole;
      notes: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<Tables["profiles"]["Row"]> & {
      id: string;
      email: string;
      employee_no: string;
      full_name: string;
      app_role: AppRole;
    };
    Update: Partial<Tables["profiles"]["Row"]>;
  };
  clients: {
    Row: {
      id: string;
      client_code: string;
      client_name: string;
      notes: string | null;
      department_id: string | null;
      is_active: boolean;
      sort_order: number;
      created_at: string;
      created_by: string | null;
      updated_at: string;
      updated_by: string | null;
    };
    Insert: Partial<Tables["clients"]["Row"]> & {
      client_code: string;
      client_name: string;
    };
    Update: Partial<Tables["clients"]["Row"]>;
  };
  client_assignments: {
    Row: {
      id: string;
      client_id: string;
      user_id: string;
      department_id: string | null;
      is_primary: boolean;
      is_active: boolean;
      assigned_at: string;
      assigned_by: string | null;
    };
    Insert: Partial<Tables["client_assignments"]["Row"]> & {
      client_id: string;
      user_id: string;
    };
    Update: Partial<Tables["client_assignments"]["Row"]>;
  };
  department_client_links: {
    Row: {
      id: string;
      department_id: string;
      client_id: string;
      is_active: boolean;
      created_at: string;
      created_by: string | null;
      updated_at: string;
      updated_by: string | null;
    };
    Insert: Partial<Tables["department_client_links"]["Row"]> & {
      department_id: string;
      client_id: string;
    };
    Update: Partial<Tables["department_client_links"]["Row"]>;
  };
  user_registration_requests: {
    Row: {
      id: string;
      auth_user_id: string | null;
      email: string;
      employee_no: string;
      full_name: string;
      department_id: string;
      status: UserRegistrationStatus;
      requested_at: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      review_comment: string | null;
    };
    Insert: Partial<Tables["user_registration_requests"]["Row"]> & {
      email: string;
      employee_no: string;
      full_name: string;
      department_id: string;
    };
    Update: Partial<Tables["user_registration_requests"]["Row"]>;
  };
  notices: {
    Row: {
      id: string;
      notice_type: NoticeType;
      title: string;
      content: string;
      is_pinned: boolean;
      publish_start_date: string | null;
      publish_end_date: string | null;
      view_count: number;
      is_active: boolean;
      created_by: string | null;
      created_at: string;
      updated_by: string | null;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["notices"]["Row"]> & {
      notice_type: NoticeType;
      title: string;
      content: string;
    };
    Update: Partial<Tables["notices"]["Row"]>;
  };
  notice_comments: {
    Row: {
      id: string;
      notice_id: string;
      parent_id: string | null;
      content: string;
      author_name: string;
      author_department_name: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["notice_comments"]["Row"]> & {
      notice_id: string;
      content: string;
      author_name: string;
      created_by: string;
    };
    Update: Partial<Tables["notice_comments"]["Row"]>;
  };
  work_categories: {
    Row: {
      id: string;
      category_code: string;
      category_name: string;
      icon_key: string;
      sort_order: number;
      is_active: boolean;
    };
    Insert: Partial<Tables["work_categories"]["Row"]> & {
      category_code: string;
      category_name: string;
      icon_key: string;
    };
    Update: Partial<Tables["work_categories"]["Row"]>;
  };
  weekly_client_reports: {
    Row: {
      id: string;
      week_start_date: string;
      week_end_date: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
      department_id: string;
      client_id: string;
      status: ClientReportStatus;
      no_special_issue: boolean;
      created_by: string;
      updated_by: string | null;
      submitted_at: string | null;
      department_reviewed_by: string | null;
      department_reviewed_at: string | null;
      review_comment: string | null;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["weekly_client_reports"]["Row"]> & {
      week_start_date: string;
      week_end_date: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
      department_id: string;
      client_id: string;
      created_by: string;
    };
    Update: Partial<Tables["weekly_client_reports"]["Row"]>;
  };
  weekly_client_report_items: {
    Row: {
      id: string;
      report_id: string;
      item_period: ItemPeriod;
      importance: Importance;
      work_category_id: string;
      title: string;
      content: string;
      sort_order: number;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<Tables["weekly_client_report_items"]["Row"]> & {
      report_id: string;
      item_period: ItemPeriod;
      importance: Importance;
      work_category_id: string;
      title: string;
      content: string;
    };
    Update: Partial<Tables["weekly_client_report_items"]["Row"]>;
  };
  weekly_report_item_requests: {
    Row: {
      id: string;
      target_type: "client_item" | "department_common";
      target_key: string;
      report_item_id: string | null;
      department_submission_id: string | null;
      section_type: "common" | "facility" | "vacancy" | "holiday_work" | null;
      item_period: ItemPeriod | null;
      item_sort_order: number | null;
      request_content: string;
      request_author_name: string;
      request_author_department_name: string | null;
      result_content: string | null;
      result_author_name: string | null;
      result_author_department_name: string | null;
      result_created_by: string | null;
      result_created_at: string | null;
      result_updated_at: string | null;
      closed_by: string | null;
      closed_author_name: string | null;
      closed_author_department_name: string | null;
      closed_at: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["weekly_report_item_requests"]["Row"]> & {
      target_type: "client_item" | "department_common";
      target_key: string;
      request_content: string;
      request_author_name: string;
      created_by: string;
    };
    Update: Partial<Tables["weekly_report_item_requests"]["Row"]>;
  };
  weekly_volumes: {
    Row: {
      id: string;
      report_id: string;
      volume_type: VolumeType;
      quantity: number;
      unit: VolumeUnit;
      custom_unit: string | null;
      note: string | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<Tables["weekly_volumes"]["Row"]> & {
      report_id: string;
      volume_type: VolumeType;
      quantity: number;
      unit: VolumeUnit;
    };
    Update: Partial<Tables["weekly_volumes"]["Row"]>;
  };
  department_weekly_submissions: {
    Row: {
      id: string;
      department_id: string;
      week_start_date: string;
      week_end_date: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
      status: DepartmentSubmissionStatus;
      exception_reason: string | null;
      finalized_by: string | null;
      finalized_at: string | null;
      division_reviewed_by: string | null;
      division_reviewed_at: string | null;
      division_review_comment: string | null;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["department_weekly_submissions"]["Row"]> & {
      department_id: string;
      week_start_date: string;
      week_end_date: string;
      report_year: number;
      report_month: number;
      week_of_month: number;
    };
    Update: Partial<Tables["department_weekly_submissions"]["Row"]>;
  };
  department_weekly_contents: {
    Row: {
      id: string;
      submission_id: string;
      section_type: "common" | "facility" | "vacancy" | "holiday_work";
      current_importance: Importance;
      current_work_category_id: string | null;
      current_week_content: string;
      next_importance: Importance;
      next_work_category_id: string | null;
      next_week_content: string;
      created_by: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      deleted_by: string | null;
    };
    Insert: Partial<Tables["department_weekly_contents"]["Row"]> & {
      submission_id: string;
      section_type: "common" | "facility" | "vacancy" | "holiday_work";
    };
    Update: Partial<Tables["department_weekly_contents"]["Row"]>;
  };
  approval_history: {
    Row: {
      id: string;
      target_type: "client_report" | "department_submission";
      target_id: string;
      action: string;
      previous_status: string | null;
      next_status: string;
      comment: string | null;
      actor_id: string;
      created_at: string;
    };
    Insert: Partial<Tables["approval_history"]["Row"]> & {
      target_type: "client_report" | "department_submission";
      target_id: string;
      action: string;
      next_status: string;
      actor_id: string;
    };
    Update: Partial<Tables["approval_history"]["Row"]>;
  };
  mini_game_scores: {
    Row: {
      id: string;
      user_id: string;
      score: number;
      duration_seconds: number;
      max_level: number;
      snack_count: number;
      created_at: string;
    };
    Insert: Partial<Tables["mini_game_scores"]["Row"]> & {
      user_id: string;
      score: number;
    };
    Update: Partial<Tables["mini_game_scores"]["Row"]>;
  };
};

type NormalizeTable<T extends { Row: object; Insert: object; Update: object }> = {
  Row: T["Row"] & Record<string, unknown>;
  Insert: T["Insert"] & Record<string, unknown>;
  Update: T["Update"] & Record<string, unknown>;
  Relationships: [];
};

type WithRelationships<T extends Record<string, { Row: object; Insert: object; Update: object }>> = {
  [K in keyof T]: NormalizeTable<T[K]>;
};

type NormalizeFunction<T extends { Args: object; Returns: unknown }> = {
  Args: T["Args"] & Record<string, unknown>;
  Returns: T["Returns"];
};

export type Database = {
  public: {
    Tables: WithRelationships<Tables>;
    Views: {
      safe_department_users: {
        Row: Pick<Tables["profiles"]["Row"], "id" | "full_name" | "department_id" | "app_role" | "is_active"> &
          Record<string, unknown>;
        Relationships: [];
      };
    };
    Functions: {
      bulk_import_clients_atomic: {
        Args: {
          p_rows: Json;
        };
        Returns: Json;
      };
      cancel_client_reports_submission_atomic: {
        Args: {
          p_report_ids: string[];
        };
        Returns: Json;
      };
      cancel_department_submission_atomic: {
        Args: {
          p_submission_id: string;
        };
        Returns: Json;
      };
      save_client_report_atomic: {
        Args: {
          p_report_id?: string | null;
          p_department_id: string;
          p_client_id: string;
          p_week_start_date: string;
          p_week_end_date: string;
          p_report_year: number;
          p_report_month: number;
          p_week_of_month: number;
          p_status: string;
          p_no_special_issue: boolean;
          p_items: Json;
          p_volumes: Json;
        };
        Returns: Json;
      };
      save_department_submission_atomic: {
        Args: {
          p_submission_id?: string | null;
          p_department_id: string;
          p_week_start_date: string;
          p_week_end_date: string;
          p_report_year: number;
          p_report_month: number;
          p_week_of_month: number;
          p_status: string;
          p_exception_reason?: string | null;
          p_contents: Json;
        };
        Returns: Json;
      };
      soft_delete_client_reports_atomic: {
        Args: {
          p_report_ids: string[];
        };
        Returns: Json;
      };
      submit_client_reports_atomic: {
        Args: {
          p_report_ids: string[];
        };
        Returns: Json;
      };
      transition_client_report_status: {
        Args: { report_id: string; next_status: string; comment?: string | null };
        Returns: Json;
      };
      transition_department_submission_status: {
        Args: { submission_id: string; next_status: string; comment?: string | null };
        Returns: Json;
      };
      increment_notice_view: {
        Args: { notice_id: string };
        Returns: void;
      };
    } extends infer F
      ? { [K in keyof F]: F[K] extends { Args: object; Returns: unknown } ? NormalizeFunction<F[K]> : never }
      : never;
    Enums: Record<string, never>;
  };
};
