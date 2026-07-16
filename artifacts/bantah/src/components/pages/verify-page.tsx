import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { CheckCircle2, Copy, LoaderCircle, Search, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchVerificationOverview,
  fetchVerificationRequest,
  submitVerificationApplication,
  type VerificationBadge,
  type VerificationChain,
  type VerificationOverviewResponse,
  type VerificationRequest,
  type VerificationStatus,
  type VerificationSubmissionPayload,
  type VerificationTier,
} from '@/lib/verification';
import { cn } from '@/lib/utils';

type VerifyFormState = VerificationSubmissionPayload & {
  confirmScope: boolean;
  confirmOfficial: boolean;
};

const initialForm: VerifyFormState = {
  projectName: '',
  contractAddress: '',
  chain: 'solana',
  officialTwitter: '',
  officialTelegram: '',
  website: '',
  description: '',
  contact: '',
  tier: 'standard',
  confirmScope: false,
  confirmOfficial: false,
};

const badgeGuide: Array<{ badge: VerificationBadge; emoji: string; label: string; meaning: string; tone: string }> = [
  {
    badge: 'verified',
    emoji: '\u2705',
    label: 'AnyAlpha Verified',
    meaning: 'Fully reviewed and confirmed legitimate by AnyAlpha.',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  {
    badge: 'community_vouched',
    emoji: '\u26A1',
    label: 'Community Vouched',
    meaning: 'Passed intake checks and is waiting for final human review.',
    tone: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  {
    badge: 'unverified_clone',
    emoji: '\u26A0',
    label: 'Unverified Clone',
    meaning: 'Looks like a copy of a known project and needs caution.',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  {
    badge: 'flagged',
    emoji: '\u{1F534}',
    label: 'Flagged',
    meaning: 'Reported or held for review because trust signals conflict.',
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  },
];

const workflowSteps = [
  {
    step: '01',
    title: 'Submit request',
    body: 'Share project identity, contract, official socials, website, and a one-line description.',
  },
  {
    step: '02',
    title: 'Auto-scan intake',
    body: 'The request is scored immediately and either queued, flagged, or rejected with a reason.',
  },
  {
    step: '03',
    title: 'Team review',
    body: 'AnyAlpha receives the request and handles it inside the verification queue.',
  },
  {
    step: '04',
    title: 'Badge decision',
    body: 'Approved projects receive the proper trust badge and anti-clone protection coverage.',
  },
];

const goodFits = [
  'Protocols, DAOs, DeFi products, infra tools, and serious utility projects.',
  'Teams that need a clear official surface when clones or impersonators appear.',
  'Projects with public socials, a real website, and a product claim users can inspect.',
];

const notFits = [
  'Meme coins with no utility claim.',
  'Fresh launches with no public presence yet.',
  'Anything submitted with fake socials or unofficial community links.',
];

const rejectionReasons = [
  'Contract or chain details do not match the selected network.',
  'The project falls outside verification scope and belongs in slop discovery instead.',
  'The request appears to mirror an already verified project with a different contract.',
  'Official trust surfaces are missing or inconsistent enough to halt review.',
];

function statusTone(status: VerificationStatus) {
  switch (status) {
    case 'approved':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
    case 'under_review':
    case 'received':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-300';
    case 'flagged':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
    case 'auto_rejected':
    case 'rejected':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-300';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function statusLabel(status: VerificationStatus) {
  switch (status) {
    case 'received':
      return 'Received';
    case 'under_review':
      return 'Under review';
    case 'auto_rejected':
      return 'Auto-rejected';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'flagged':
      return 'Flagged';
    default:
      return status;
  }
}

function badgeSummary(badge?: VerificationBadge) {
  return badgeGuide.find((entry) => entry.badge === badge) ?? null;
}

function chainLabel(chain: VerificationChain) {
  switch (chain) {
    case 'solana':
      return 'Solana';
    case 'ethereum':
      return 'Ethereum';
    case 'base':
      return 'Base';
    case 'arbitrum':
      return 'Arbitrum';
    default:
      return chain;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function SurfaceCard({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border border-border bg-card', className)}>
      <div className="border-b border-border px-3 py-2 sm:px-4">
        {eyebrow ? <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{eyebrow}</div> : null}
        <h2 className="mt-0.5 text-sm font-black tracking-tight text-foreground sm:text-base">{title}</h2>
      </div>
      <div className="px-3 py-3 sm:px-4">{children}</div>
    </section>
  );
}

function RequestStatusCard({ request }: { request: VerificationRequest }) {
  const badge = badgeSummary(request.badge);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn('rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]', statusTone(request.status))}>
          {statusLabel(request.status)}
        </Badge>
        {badge ? (
          <Badge className={cn('rounded border px-2 py-1 text-[10px] font-black tracking-[0.05em]', badge.tone)}>
            <span className="mr-1 leading-none">{badge.emoji}</span>
            {badge.label}
          </Badge>
        ) : null}
        <span className="text-[11px] text-muted-foreground">ID {request.id}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="border border-border bg-background/50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Project</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{request.projectName}</div>
        </div>
        <div className="border border-border bg-background/50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Chain</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{chainLabel(request.chain)}</div>
        </div>
        <div className="border border-border bg-background/50 px-3 py-2 sm:col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Contract</div>
          <div className="mt-1 break-all font-mono text-xs text-foreground">{request.contractAddress}</div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="border border-border bg-background/50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Auto-scan</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{request.autoScanScore}/100</div>
        </div>
        <div className="border border-border bg-background/50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Review target</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{request.reviewWindowHours}h</div>
        </div>
        <div className="border border-border bg-background/50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Team notified</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{request.notificationState === 'sent' ? 'Yes' : 'Queued'}</div>
        </div>
      </div>

      {request.rejectionReason ? (
        <div className="border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <span className="font-bold text-rose-300">Reason:</span> {request.rejectionReason}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Timeline</div>
        <div className="space-y-2">
          {request.timeline.map((event) => (
            <div key={`${event.code}-${event.at}`} className="border border-border bg-background/50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-foreground">{event.label}</div>
                  {event.detail ? <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{event.detail}</div> : null}
                </div>
                <div className="shrink-0 text-[10px] text-muted-foreground">{formatDate(event.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [form, setForm] = useState<VerifyFormState>(initialForm);
  const [overview, setOverview] = useState<VerificationOverviewResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<VerificationRequest | null>(null);
  const [trackedRequest, setTrackedRequest] = useState<VerificationRequest | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchVerificationOverview(controller.signal)
      .then((response) => setOverview(response))
      .catch(() => {
        setOverview(null);
      });

    return () => controller.abort();
  }, []);

  const topStats = useMemo(
    () => [
      {
        label: 'Open queue',
        value: overview ? String(overview.totals.underReview) : '...',
        detail: 'Requests currently waiting for review',
      },
      {
        label: 'Standard',
        value: '24h',
        detail: 'Public review target',
      },
      {
        label: 'Priority',
        value: '6h',
        detail: 'Fast lane for urgent teams',
      },
      {
        label: 'Clone guard',
        value: 'On',
        detail: 'Protection activates after approval',
      },
    ],
    [overview],
  );

  const updateField = <K extends keyof VerifyFormState>(key: K, value: VerifyFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.confirmScope) {
      toast.error('Verification scope confirmation is required.', {
        description: 'This lane is for serious projects, not meme-only launches.',
      });
      return;
    }

    if (!form.confirmOfficial) {
      toast.error('Official source confirmation is required.', {
        description: 'The submitter must confirm the links and contract are official.',
      });
      return;
    }

    setSubmitting(true);

    try {
      const accessToken = authenticated ? await getAccessToken() : null;
      const response = await submitVerificationApplication({
        projectName: form.projectName,
        contractAddress: form.contractAddress,
        chain: form.chain,
        officialTwitter: form.officialTwitter,
        officialTelegram: form.officialTelegram,
        website: form.website,
        description: form.description,
        contact: form.contact,
        tier: form.tier,
      }, accessToken);

      setSubmittedRequest(response.request);
      setTrackedRequest(response.request);
      setLookupId(response.request.id);
      setSuccessOpen(true);
      resetForm();

      setOverview((current) =>
        current
          ? {
              ...current,
              totals: {
                ...current.totals,
                submitted: current.totals.submitted + 1,
                underReview:
                  response.request.status === 'under_review' || response.request.status === 'received'
                    ? current.totals.underReview + 1
                    : current.totals.underReview,
                rejected:
                  response.request.status === 'auto_rejected' || response.request.status === 'rejected'
                    ? current.totals.rejected + 1
                    : current.totals.rejected,
                flagged: response.request.status === 'flagged' ? current.totals.flagged + 1 : current.totals.flagged,
                approved: current.totals.approved,
                priority: response.request.tier === 'priority' ? current.totals.priority + 1 : current.totals.priority,
              },
            }
          : current,
      );

      toast.success('Verification request received.', {
        description: `${response.request.projectName} is now in the AnyAlpha verification flow.`,
      });
    } catch (error) {
      toast.error('Verification request failed.', {
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (requestId?: string) => {
    const nextId = (requestId ?? lookupId).trim();
    if (!nextId) {
      setLookupError('Enter a verification request ID.');
      setTrackedRequest(null);
      return;
    }

    setLookupLoading(true);
    setLookupError(null);

    try {
      const response = await fetchVerificationRequest(nextId);
      setTrackedRequest(response.request);
      setLookupId(response.request.id);
    } catch (error) {
      setTrackedRequest(null);
      setLookupError(error instanceof Error ? error.message : 'Unable to load verification status.');
    } finally {
      setLookupLoading(false);
    }
  };

  const copyRequestId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Request ID copied.', { description: value });
    } catch {
      toast.error('Clipboard copy failed.', { description: 'Copy the request ID manually from the dialog.' });
    }
  };

  return (
    <div className="motion-stagger flex h-full min-h-0 flex-col overflow-hidden">
      <div className="surface-sheen flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border bg-card">
        <div className="shrink-0 border-b border-border bg-background px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                <span className="text-sm leading-none">\u2705</span>
                Verify
              </div>
              <h1 className="mt-1 text-lg font-black tracking-tight text-foreground sm:text-2xl">AnyAlpha Verification</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">
                A real intake lane for serious projects that need trust signals, faster review, and anti-clone protection without flattening the rest of the market into safe-mode slop.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded border-border bg-card text-xs"
                onClick={() => {
                  setLookupOpen(true);
                  if (submittedRequest?.id) {
                    setLookupId(submittedRequest.id);
                    setTrackedRequest(submittedRequest);
                  }
                }}
              >
                <Search className="h-3.5 w-3.5" />
                Track request
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {topStats.map((stat) => (
              <div key={stat.label} className="border border-border bg-card px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-lg font-black tracking-tight text-foreground">{stat.value}</div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{stat.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40">
          <div className="mx-auto grid max-w-7xl gap-3 px-2 py-2 sm:px-3 lg:grid-cols-[minmax(0,1.3fr)_360px]">
            <div className="space-y-3">
              <SurfaceCard title="Submit verification request" eyebrow="Public intake">
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Project name</label>
                      <Input
                        value={form.projectName}
                        onChange={(event) => updateField('projectName', event.target.value)}
                        placeholder="AnyAlpha"
                        className="h-9 rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Chain</label>
                      <Select value={form.chain} onValueChange={(value) => updateField('chain', value as VerificationChain)}>
                        <SelectTrigger className="h-9 rounded border-border bg-background/60 text-sm">
                          <SelectValue placeholder="Select chain" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solana">Solana</SelectItem>
                          <SelectItem value="ethereum">Ethereum</SelectItem>
                          <SelectItem value="base">Base</SelectItem>
                          <SelectItem value="arbitrum">Arbitrum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Contract address</label>
                      <Input
                        value={form.contractAddress}
                        onChange={(event) => updateField('contractAddress', event.target.value)}
                        placeholder={form.chain === 'solana' ? '7xK...abc' : '0x...'}
                        className="h-9 rounded border-border bg-background/60 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Official Twitter</label>
                      <Input
                        value={form.officialTwitter}
                        onChange={(event) => updateField('officialTwitter', event.target.value)}
                        placeholder="@project or https://x.com/project"
                        className="h-9 rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Official Telegram</label>
                      <Input
                        value={form.officialTelegram}
                        onChange={(event) => updateField('officialTelegram', event.target.value)}
                        placeholder="@project or https://t.me/project"
                        className="h-9 rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Website</label>
                      <Input
                        value={form.website}
                        onChange={(event) => updateField('website', event.target.value)}
                        placeholder="https://project.xyz"
                        className="h-9 rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">What does the project do?</label>
                      <Textarea
                        value={form.description}
                        onChange={(event) => updateField('description', event.target.value)}
                        placeholder="One line on the utility, product, or market role."
                        className="min-h-[88px] rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Submitter contact</label>
                      <Input
                        value={form.contact}
                        onChange={(event) => updateField('contact', event.target.value)}
                        placeholder="@founderhandle"
                        className="h-9 rounded border-border bg-background/60 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Review tier</label>
                      <Select value={form.tier} onValueChange={(value) => updateField('tier', value as VerificationTier)}>
                        <SelectTrigger className="h-9 rounded border-border bg-background/60 text-sm">
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard / Free</SelectItem>
                          <SelectItem value="priority">Priority / 1 SOL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2 border border-border bg-background/50 px-3 py-3">
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={form.confirmScope}
                        onCheckedChange={(checked) => updateField('confirmScope', checked === true)}
                        className="mt-0.5"
                      />
                      <span>This request is for a real product, protocol, or utility project and not a meme-only launch.</span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={form.confirmOfficial}
                        onCheckedChange={(checked) => updateField('confirmOfficial', checked === true)}
                        className="mt-0.5"
                      />
                      <span>The contract, socials, and website above are the official project surfaces.</span>
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      Standard review is free. Priority requests target 6 hours and still go through the same trust checks.
                    </p>
                    <Button type="submit" className="rounded text-xs font-bold" disabled={submitting}>
                      {submitting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      Submit request
                    </Button>
                  </div>
                </form>
              </SurfaceCard>

              <SurfaceCard title="How the flow works" eyebrow="Review path">
                <div className="grid gap-2 md:grid-cols-2">
                  {workflowSteps.map((step) => (
                    <div key={step.step} className="border border-border bg-background/50 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">{step.step}</span>
                        <span className="text-[11px] text-muted-foreground">{step.title}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.body}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard title="Anti-clone protection" eyebrow="Trust defense">
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                    <p>
                      Verified projects get clone awareness built into the trust layer. When a copycat surfaces with the same identity pattern but a different contract, the system can hold it for caution instead of letting it blend into discovery as if nothing happened.
                    </p>
                    <p>
                      That matters most when teams are fighting fake deployments, lookalike pages, or rushed launches trying to ride an established name.
                    </p>
                  </div>

                  <div className="border border-border bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-foreground">
                      <Siren className="h-3.5 w-3.5 text-primary" />
                      Clone path
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="border border-border bg-card px-2.5 py-2">Verified project exists</div>
                      <div className="border border-border bg-card px-2.5 py-2">Lookalike request or token appears</div>
                      <div className="border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-200">Held as unverified clone or flagged for review</div>
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <div className="space-y-3">
              <SurfaceCard title="Badge guide" eyebrow="Trust labels">
                <div className="space-y-2">
                  {badgeGuide.map((item) => (
                    <div key={item.badge} className="border border-border bg-background/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-black tracking-[0.04em]', item.tone)}>
                          <span className="leading-none">{item.emoji}</span>
                          {item.label}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.meaning}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard title="Who should apply" eyebrow="Fit check">
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Good fit</div>
                    <div className="mt-2 space-y-2">
                      {goodFits.map((point) => (
                        <div key={point} className="border border-border bg-background/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-300">Not for this lane</div>
                    <div className="mt-2 space-y-2">
                      {notFits.map((point) => (
                        <div key={point} className="border border-border bg-background/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Review policy" eyebrow="What to expect">
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="border border-border bg-background/50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Standard</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">Free</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">Badge, trust review, and anti-clone protection after approval.</div>
                    </div>
                    <div className="border border-border bg-background/50 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Priority</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">1 SOL</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">Faster queue target plus a 7-day verified section pin after approval.</div>
                    </div>
                  </div>

                  <div className="border border-border bg-background/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      What verification is not
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      Verification is not a price call, not financial advice, and not a guarantee against future rugs. It is simply a trust surface that says AnyAlpha reviewed the legitimacy claim.
                    </p>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard title="Common rejection reasons" eyebrow="Practical clarity">
                <div className="space-y-2">
                  {rejectionReasons.map((reason) => (
                    <div key={reason} className="border border-border bg-background/50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                      {reason}
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-xl border-border bg-card p-0">
          <DialogHeader className="border-b border-border px-4 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Request received
            </DialogTitle>
            <DialogDescription className="text-xs leading-5 text-muted-foreground">
              AnyAlpha stored the request and attached a live tracking ID so you can check status without chasing support.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-4 py-4">
            {submittedRequest ? <RequestStatusCard request={submittedRequest} /> : null}
          </div>

          <DialogFooter className="border-t border-border px-4 py-4">
            {submittedRequest ? (
              <>
                <Button type="button" variant="outline" className="rounded border-border text-xs" onClick={() => void copyRequestId(submittedRequest.id)}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy ID
                </Button>
                <Button
                  type="button"
                  className="rounded text-xs"
                  onClick={() => {
                    setSuccessOpen(false);
                    setLookupOpen(true);
                  }}
                >
                  <Search className="h-3.5 w-3.5" />
                  Open tracker
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent className="max-w-xl border-border bg-card p-0">
          <DialogHeader className="border-b border-border px-4 py-4">
            <DialogTitle className="text-base font-black">Track verification request</DialogTitle>
            <DialogDescription className="text-xs leading-5 text-muted-foreground">
              Enter the request ID from your submission receipt to load the latest public status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4 py-4">
            <div className="flex gap-2">
              <Input
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value.toUpperCase())}
                placeholder="AA-VRF-XXXXXX"
                className="h-9 rounded border-border bg-background/60 font-mono text-xs"
              />
              <Button type="button" className="rounded text-xs" onClick={() => void handleLookup()} disabled={lookupLoading}>
                {lookupLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Lookup
              </Button>
            </div>

            {lookupError ? <div className="border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{lookupError}</div> : null}
            {trackedRequest ? <RequestStatusCard request={trackedRequest} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
