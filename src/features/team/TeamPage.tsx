import { useState } from 'react';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, SkeletonList, ErrorState } from '@/components/ui/States';
import { useTeam } from './teamService';
import { useAuth } from '@/hooks/AuthContext';
import { Copy, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog, Check } from 'lucide-react';
import type { TeamMembership } from '@/config/types';

interface TeamPageProps {
  orgId: string;
  seatLimit: number;
}

interface Credentials {
  username: string;
  password: string;
}

export function TeamPage({ orgId, seatLimit }: TeamPageProps) {
  const { currentMembership } = useAuth();
  const { members, loading, error, createMember, changeRole, resetPassword, removeMember, renameMember, refresh, clearError } =
    useTeam(orgId);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'employee'>('employee');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMembership | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMembership | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const activeCount = members.filter((m) => m.status === 'active').length;

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <Page>
      <PageHeader
        title="Team"
        description="Your roster, sign-in accounts, and what each person can do."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)} disabled={activeCount >= seatLimit}>
            Add member
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-2.5 text-xs text-error-300 animate-fade-up">
          {error}
          <button onClick={clearError} aria-label="Dismiss" className="ml-auto text-ink-400 hover:text-ink-100">
            ×
          </button>
        </div>
      )}

      <p className="mb-4 text-xs text-ink-400 animate-fade-up">
        <span className="font-semibold text-ink-200">{activeCount}</span> of {seatLimit} seats used · verified
        accounts can sign in and use the timeclock
      </p>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<UserCog size={20} />}
          title="No team members yet"
          description="Add admins to help run the workspace, or crew members who just need the timeclock."
        />
      ) : (
        <div className="card divide-y divide-ink-700 overflow-hidden animate-fade-up">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                {editingId === m.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="field-input max-w-[220px]"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={60}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      icon={<Check size={13} />}
                      onClick={async () => {
                        await renameMember(m, editName);
                        setEditingId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink-100">{m.name || m.email}</span>
                      <Badge tone={m.role === 'owner' ? 'green' : m.role === 'admin' ? 'info' : 'neutral'}>
                        {m.role === 'owner' && <ShieldCheck size={10} />}
                        {m.role}
                      </Badge>
                      {m.id === currentMembership?.id && <Badge tone="green">You</Badge>}
                      {m.status === 'pending' && <Badge tone="warning">Pending</Badge>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono text-2xs text-ink-400">{stripLoginDomain(m.email) || m.email}</span>
                      <button
                        className="text-ink-400 hover:text-ink-200"
                        onClick={() => copy(stripLoginDomain(m.email) || m.email)}
                        aria-label="Copy username"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingId !== m.id && m.role !== 'owner' && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Pencil size={13} />}
                      onClick={() => {
                        setEditingId(m.id);
                        setEditName(m.name);
                      }}
                    >
                      Rename
                    </Button>
                    <select
                      className="field-input h-8 w-auto py-0 text-xs"
                      value={m.role}
                      onChange={(e) => void changeRole(m.id, e.target.value as TeamMembership['role'])}
                      aria-label="Change role"
                    >
                      <option value="admin">Admin</option>
                      <option value="employee">Employee</option>
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<KeyRound size={13} />}
                      onClick={() => {
                        setResetTarget(m);
                        setNewPassword('');
                        setResetResult(null);
                      }}
                    >
                      Reset
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(m)} aria-label="Remove member">
                      <Trash2 size={14} className="text-ink-400" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add member */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add team member"
        description="They sign in with the username and password you set here."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const result = await createMember(name, role);
                if (result) {
                  setCredentials(result);
                  setName('');
                  setRole('employee');
                }
                setAddOpen(false);
              }}
              disabled={!name.trim()}
            >
              Create account
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Dan Ramirez" />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}>
            <option value="employee">Employee — timeclock and own tickets</option>
            <option value="admin">Admin — full workspace access</option>
          </Select>
        </div>
      </Modal>

      {/* One-time credentials */}
      <Modal
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title="Account created"
        description="Copy these sign-in details now — the password is only shown once."
        width="sm"
        footer={
          <Button fullWidth onClick={() => setCredentials(null)}>
            Done
          </Button>
        }
      >
        {credentials && (
          <div className="space-y-3">
            <CredRow label="Username" value={credentials.username} onCopy={() => copy(credentials.username)} />
            <CredRow label="Password" value={credentials.password} onCopy={() => copy(credentials.password)} mono />
          </div>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset password — ${resetTarget?.name ?? ''}`}
        description="Leave blank to auto-generate a secure password."
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!resetTarget?.user_id) return;
                const result = await resetPassword(resetTarget.user_id, newPassword || undefined);
                if (result) setResetResult(result.password);
              }}
            >
              Reset password
            </Button>
          </div>
        }
      >
        {resetResult ? (
          <CredRow label="New password" value={resetResult} onCopy={() => copy(resetResult)} mono />
        ) : (
          <Input
            label="New password (optional)"
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to generate"
            hint="6–72 characters"
          />
        )}
      </Modal>

      {/* Remove member */}
      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove team member?"
        description="They lose access immediately and their employee entry is removed."
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                if (removeTarget) await removeMember(removeTarget);
                setRemoveTarget(null);
              }}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm font-semibold text-ink-100">{removeTarget?.name || removeTarget?.email}</p>
      </Modal>
    </Page>
  );
}

function stripLoginDomain(email: string): string {
  return email.replace(/@(tradedesk|crewclock)\.access$/, '');
}

function CredRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`flex-1 truncate rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-green-300 ${mono ? 'font-mono' : ''}`}>
          {value}
        </code>
        <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={onCopy}>
          Copy
        </Button>
      </div>
    </div>
  );
}
