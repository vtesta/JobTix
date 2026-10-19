export type Role = 'owner' | 'admin' | 'employee';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type PlanId = 'free' | 'solo' | 'team' | 'business';

export interface Organization {
  id: string;
  name: string;
  default_recipient_email: string;
  business_phone: string | null;
  industry: string | null;
  company_size: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_plan: PlanId;
  subscription_status: SubscriptionStatus;
  seat_limit: number;
  work_week_start: number;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  name: string;
  role: Role;
  status: 'pending' | 'active';
  invited_by: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  job_name: string;
  job_date: string;
  names: string[];
  job_time: string;
  start_time: string;
  end_time: string;
  tasks: string[];
  materials: string[];
  sent_at: string | null;
  completed_at: string | null;
  quickbooks_uploaded_at: string | null;
  created_by: string;
  organization_id: string | null;
  created_at: string;
}

export interface TicketItemRow {
  id: string;
  ticket_id: string;
  kind: 'task' | 'material';
  content: string;
  sort_index: number;
}

export interface JobName {
  id: string;
  name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  default_rate: number;
  notes: string;
  organization_id: string | null;
  created_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface Invoice {
  id: string;
  organization_id: string;
  job_name: string;
  invoice_number: string;
  status: InvoiceStatus;
  client_name: string;
  client_email: string;
  client_phone: string;
  issue_date: string;
  due_date: string | null;
  notes: string;
  tax_rate_pct: number;
  ticket_ids: string[];
  sent_at: string | null;
  paid_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  organization_id: string;
  kind: 'labor' | 'material';
  description: string;
  ticket_ref: string;
  ticket_id: string | null;
  quantity: number;
  unit_price: number;
  sort_index: number;
  created_at: string;
}

/** Draft state for the invoice builder before anything is saved. */
export interface InvoiceDraftLine {
  kind: 'labor' | 'material';
  description: string;
  ticket_ref: string;
  ticket_id?: string | null;
  quantity: number;
  unit_price: number;
  /** True when the price was auto-filled from the org's learned price book. */
  learnedPrice?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  user_id: string | null;
  organization_id: string | null;
  created_at: string;
}

export interface TimeclockEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  organization_id: string | null;
  created_at: string;
}

export interface QBExport {
  id: string;
  file_name: string;
  file_path: string;
  ticket_count: number;
  ticket_ids: string[];
  organization_id: string | null;
  created_at: string;
}
