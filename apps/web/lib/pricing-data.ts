export interface PackagingTier {
  id: string;
  name: string;
  badge: string;
  intendedRole: string;
  currentAvailability: string;
  dataBoundary: string;
  licensingStatus: string;
  statusTag: string;
  active?: boolean;
}

export interface PrelaunchPrinciple {
  title: string;
  description: string;
  tag: string;
}

export const packagingTiers: PackagingTier[] = [
  {
    id: 'local-community',
    name: 'Local / Community',
    badge: 'Open Foundation',
    intendedRole: 'Individual developers, open-source maintainers, and local CLI workflows.',
    currentAvailability: 'Available now in repository workspaces and local terminal execution.',
    dataBoundary:
      '100% on-device. Source code, AST indexes, and .trace files remain strictly local.',
    licensingStatus: 'Planned free core for local artifact generation and repository governance.',
    statusTag: 'Active Local Reference',
  },
  {
    id: 'team-cloud',
    name: 'Team Cloud',
    badge: 'Under Validation',
    intendedRole:
      'Engineering teams coordinating multi-branch changes, PR briefs, and daily digests.',
    currentAvailability:
      'Early preview validation. No checkout, credit card capture, or paid tier is live.',
    dataBoundary:
      'Ephemeral projection. Synchronizes signed summaries; zero raw source code stored.',
    licensingStatus:
      'Pricing structure will be defined strictly by verified team coordination value.',
    statusTag: 'Validation in Progress',
    active: true,
  },
  {
    id: 'enterprise-private',
    name: 'Enterprise / Private',
    badge: 'Design Partnership',
    intendedRole:
      'Organizations requiring self-hosted or network-isolated runtimes, VPC isolation, and custom security policies.',
    currentAvailability:
      'Requirements and operational constraints defined with pilot design partners.',
    dataBoundary: 'Self-hosted control plane or customer-managed cloud isolation boundaries.',
    licensingStatus:
      'Formal enterprise packaging and support terms will be announced after pilot audit.',
    statusTag: 'Partner Validation',
  },
];

export const prelaunchPrinciples: PrelaunchPrinciple[] = [
  {
    title: 'Zero commercial gating on the `.trace` format',
    description:
      'The .trace artifact standard (RFC-001) is open, transparent, and portable. You will never need a paid subscription to inspect, parse, or commit your own project memory.',
    tag: 'Portability Invariant',
  },
  {
    title: 'Evidence before monetization',
    description:
      'We are focused on eliminating noise and proving bounded AST change intelligence before introducing paid commercial tiers. No checkout flows exist in this build.',
    tag: 'Product Discipline',
  },
  {
    title: 'No proprietary repository lock-in',
    description:
      'Because Git remains the sole authority and artifacts are stored in human-readable Markdown, your project intelligence survives regardless of subscription status.',
    tag: 'Zero Lock-in',
  },
];
